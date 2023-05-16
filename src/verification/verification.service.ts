import { Injectable, Logger } from '@nestjs/common'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import { RelayRegistryState, Verify } from './interfaces/relay-registry'
import { ConfigService } from '@nestjs/config'
import { Wallet } from 'ethers'
import {
    buildEvmSignature,
    EvmSignatureVerificationServerPlugin,
    // @ts-ignore
} from 'warp-contracts-plugin-signature/server'
import { EthersExtension } from 'warp-contracts-plugin-ethers'
import { StateUpdatePlugin } from 'warp-contracts-subscription-plugin'
import { RelayVerificationResult } from './dto/relay-verification-result'
import { VerificationData } from './schemas/verification-data'
import { VerificationResults } from './dto/verification-result-dto'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import { Model } from 'mongoose'
import { InjectModel } from '@nestjs/mongoose'

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name)

    private isLive?: string

    private owner

    private warp: Warp
    private contract: Contract<RelayRegistryState>

    constructor(
        private readonly config: ConfigService<{
            RELAY_REGISTRY_VALIDATOR_ADDRESS: string
            RELAY_REGISTRY_VALIDATOR_KEY: string
            RELAY_REGISTRY_TXID: string
            IS_LIVE: string
        }>,
        @InjectModel(VerificationData.name)
        private readonly verificationDataModel: Model<VerificationData>,
    ) {
        LoggerFactory.INST.logLevel('error')

        this.isLive = config.get<string>('IS_LIVE', { infer: true })

        this.logger.log(
            `Initializing Contracts Service IS_LIVE: ${this.isLive}`,
        )

        const ownerKey = this.config.get<string>(
            'RELAY_REGISTRY_VALIDATOR_KEY',
            {
                infer: true,
            },
        )

        if (ownerKey !== undefined) {
            this.owner = {
                address: this.config.get<string>(
                    'RELAY_REGISTRY_VALIDATOR_ADDRESS',
                    {
                        infer: true,
                    },
                ),
                key: ownerKey,
                signer: new Wallet(ownerKey),
            }

            this.warp = WarpFactory.forMainnet({
                inMemory: true,
                dbLocation: '-ator',
            })
                .use(new EthersExtension())
                .use(new EvmSignatureVerificationServerPlugin())

            const registryTxId = this.config.get<string>(
                'RELAY_REGISTRY_TXID',
                {
                    infer: true,
                },
            )
            if (registryTxId !== undefined) {
                this.warp.use(new StateUpdatePlugin(registryTxId, this.warp))
                this.contract =
                    this.warp.contract<RelayRegistryState>(registryTxId)
            } else this.logger.error('Missing regustry txid')
        } else this.logger.error('Missing contract owner key...')
    }

    private isVerified(
        fingerprint: string,
        state: RelayRegistryState,
    ): boolean {
        return fingerprint in state.verified
    }

    private isRegistered(
        fingerprint: string,
        key: string,
        state: RelayRegistryState,
    ): boolean {
        if (state.claims[key] !== undefined)
            return state.claims[key].includes(fingerprint)
        else return false
    }

    public async storeVerification(
        verificationResults: VerificationResults,
    ): Promise<VerificationData> {
        const verificationStamp = Date.now()

        const atornauts = verificationResults.map(
            (result, index, array) => result.relay,
        )

        const verificationData: VerificationData = {
            verified_at: verificationStamp,
            relays: atornauts,
        }

        this.verificationDataModel
            .create<VerificationData>(verificationData)
            .catch((error) => this.logger.error(error))

        return verificationData
    }

    public async confirmVerification(
        data: VerificationResults,
    ): Promise<VerificationResults> {
        const failed = data.filter(
            (value, index, array) => value.result === 'Failed',
        )
        if (failed.length > 0) {
            this.logger.log(
                `Failed publishing verification of ${
                    failed.length
                } relay(s): [${failed
                    .map((result, index, array) => result.relay.fingerprint)
                    .join(', ')}]`,
            )
        }

        const notRegistered = data.filter(
            (value, index, array) => value.result === 'NotRegistered',
        )
        if (notRegistered.length > 0) {
            this.logger.log(
                `Skipped ${
                    notRegistered.length
                } not registered relay(s): [${notRegistered
                    .map((result, index, array) => result.relay.fingerprint)
                    .join(', ')}]`,
            )
        }

        const alreadyVerified = data.filter(
            (value, index, array) => value.result === 'AlreadyVerified',
        )
        if (alreadyVerified.length > 0) {
            this.logger.log(
                `Skipped ${alreadyVerified.length} verified relay(s)`,
            )
        }

        const ok = data.filter((value, index, array) => value.result === 'OK')
        if (ok.length > 0) {
            this.logger.log(`Updated verification of ${ok.length} relay(s)`)
        }

        const confirmedRelays = data.filter(
            (value, index, array) =>
                (value.result === 'OK' || value.result === 'AlreadyVerified') &&
                value.relay.running === true,
        )

        this.logger.log(`Total confirmed relays: ${confirmedRelays.length}`)

        return confirmedRelays
    }

    public async verifyRelay(
        relay: ValidatedRelay,
    ): Promise<RelayVerificationResult> {
        if (this.contract !== undefined) {
            const data = await this.contract.readState()
            const {
                cachedValue: { state },
            } = data

            const verified: boolean = this.isVerified(relay.fingerprint, state)
            const registered = this.isRegistered(
                relay.fingerprint,
                relay.ator_public_key,
                state,
            )

            this.logger.debug(
                `${relay.fingerprint}|${relay.ator_public_key} IS_LIVE: ${this.isLive} Registered: ${registered} Verified: ${verified}`,
            )

            if (verified) {
                this.logger.debug(
                    `Already validated relay [${relay.fingerprint}]`,
                )
                return 'AlreadyVerified'
            }
            if (registered) {
                if (this.owner !== undefined) {
                    const evmSig = await buildEvmSignature(this.owner.signer)

                    if (this.isLive === 'true') {
                        this.logger.log(
                            `Verifying validated relay [${relay.fingerprint}]`,
                        )

                        await this.contract
                            .connect({
                                signer: evmSig,
                                type: 'ethereum',
                            })
                            .writeInteraction<Verify>({
                                function: 'verify',
                                fingerprint: relay.fingerprint,
                                address: relay.ator_public_key,
                            })
                    } else {
                        this.logger.warn(
                            `NOT LIVE - skipped contract call to verify relay [${relay.fingerprint}]`,
                        )
                    }

                    return 'OK'
                } else {
                    this.logger.error('Contract owner not defined')
                    return 'Failed'
                }
            } else {
                this.logger.log(
                    `Not registered relay [${relay.fingerprint}], skipping validation`,
                )
                return 'NotRegistered'
            }
        } else {
            this.logger.error('Contract not initialized')
            return 'Failed'
        }
    }
}
