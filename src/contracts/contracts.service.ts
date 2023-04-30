import { Injectable, Logger } from '@nestjs/common'
import { RegisteredRelayDto } from './dto/registred-relay-dto'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import { RelayRegistryState, Verify } from './relay-registry'
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

@Injectable()
export class ContractsService {
    private readonly logger = new Logger(ContractsService.name)

    private owner

    private warp: Warp
    private contract: Contract<RelayRegistryState>

    constructor(
        private readonly config: ConfigService<{
            RELAY_REGISTRY_OWNER_ADDRESS: string
            RELAY_REGISTRY_OWNER_KEY: string
            RELAY_REGISTRY_TXID: string
        }>,
    ) {
        LoggerFactory.INST.logLevel('error')

        const ownerKey = this.config.get<string>('RELAY_REGISTRY_OWNER_KEY', {
            infer: true,
        })

        if (ownerKey !== undefined) {
            this.owner = {
                address: this.config.get<string>(
                    'RELAY_REGISTRY_OWNER_ADDRESS',
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

    public async verifyRelay(
        relay: RegisteredRelayDto,
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

            this.logger.log(
                `${relay.fingerprint}|${relay.ator_public_key} Registered: ${registered} Verified: ${verified}`,
            )

            if (verified) return 'AlreadyVerified'
            if (registered) {
                if (this.owner !== undefined) {
                    const evmSig = await buildEvmSignature(this.owner.signer)
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

                    return 'OK'
                } else {
                    this.logger.error('Contract owner not defined')
                    return 'Failed'
                }
            } else return 'NotRegistered'
        } else {
            this.logger.error('Contract not initialized')
            return 'Failed'
        }
    }
}
