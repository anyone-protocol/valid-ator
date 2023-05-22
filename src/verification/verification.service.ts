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
import Bundlr from '@bundlr-network/client'
import { RelayValidationStatsDto } from './dto/relay-validation-stats'

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name)

    private isLive?: string

    private owner
    private bundlr

    private warp: Warp
    private contract: Contract<RelayRegistryState>

    constructor(
        private readonly config: ConfigService<{
            VALIDATOR_KEY: string
            RELAY_REGISTRY_TXID: string
            IS_LIVE: string
            BUNDLR_NODE: string
            BUNDLR_NETWORK: string
        }>,
        @InjectModel(VerificationData.name)
        private readonly verificationDataModel: Model<VerificationData>,
    ) {
        LoggerFactory.INST.logLevel('error')

        this.isLive = config.get<string>('IS_LIVE', { infer: true })

        this.logger.log(
            `Initializing Verification Service IS_LIVE: ${this.isLive}`,
        )

        const validatorKey = this.config.get<string>('VALIDATOR_KEY', {
            infer: true,
        })

        if (validatorKey !== undefined) {
            this.bundlr = (() => {
                const node = config.get<string>('BUNDLR_NODE', {
                    infer: true,
                })
                const network = config.get<string>('BUNDLR_NETWORK', {
                    infer: true,
                })

                if (node !== undefined && network !== undefined) {
                    return new Bundlr(node, network, validatorKey)
                } else {
                    return undefined
                }
            })()

            if (this.bundlr !== undefined) {
                this.logger.log(
                    `Initialized Bundlr for address: ${this.bundlr.address}`,
                )
            } else {
                this.logger.error('Failed to initialize Bundlr!')
            }

            const signer = new Wallet(validatorKey)

            this.owner = {
                address: signer.address,
                key: validatorKey,
                signer: signer,
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

    private async storeRelayMetrics(
        stamp: number,
        data: VerificationResults,
    ): Promise<string> {
        if (this.bundlr !== undefined) {
            if (this.isLive === 'true') {
                const response = await this.bundlr?.upload(
                    JSON.stringify(data),
                    {
                        tags: [
                            { name: 'Protocol', value: 'ator' },
                            { name: 'Protocol-Version', value: '0.1' },
                            {
                                name: 'Content-Timestamp',
                                value: stamp.toString(),
                            },
                            { name: 'Content-Type', value: 'application/json' },
                            { name: 'Entity-Type', value: 'relay/metrics' },
                        ],
                    },
                )

                this.logger.log(
                    `Permanently stored relay/metrics ${stamp} with ${data.length} relay(s): ${response.id} `,
                )

                return response.id
            } else {
                this.logger.warn(
                    `NOT LIVE: Not storing relay/metrics ${stamp} with ${data.length} relay(s) `,
                )
            }
        } else {
            this.logger.error(
                'Bundler not initialized, not persisting relay/metrics',
            )
        }
        return ''
    }

    private async storeValidationStats(
        stamp: number,
        data: RelayValidationStatsDto,
    ): Promise<string> {
        if (this.bundlr !== undefined) {
            if (this.isLive === 'true') {
                const response = await this.bundlr?.upload(
                    JSON.stringify(data),
                    {
                        tags: [
                            { name: 'Protocol', value: 'ator' },
                            { name: 'Protocol-Version', value: '0.1' },
                            {
                                name: 'Content-Timestamp',
                                value: stamp.toString(),
                            },
                            { name: 'Content-Type', value: 'application/json' },
                            { name: 'Entity-Type', value: 'validation/stats' },
                        ],
                    },
                )

                this.logger.log(`Permanently stored validation/stats ${stamp}: ${response.id}`)

                return response.id
            } else {
                this.logger.warn(`NOT LIVE: Not storing validation/stats ${stamp}`)
            }
        } else {
            this.logger.error(
                'Bundler not initialized, not persisting validation/stats',
            )
        }
        return ''
    }

    private getValidationStats(
        data: VerificationResults,
    ): RelayValidationStatsDto {
        return data.reduce(
            (previous, current, index, array) => {
                return {
                    consensus_weight:
                        previous.consensus_weight +
                        current.relay.consensus_weight,
                    observed_bandwidth:
                        previous.observed_bandwidth +
                        current.relay.observed_bandwidth,
                    verification: {
                        failed:
                            previous.verification.failed +
                            (current.result === 'Failed' ? 1 : 0),
                        unclaimed:
                            previous.verification.unclaimed +
                            (current.result === 'NotRegistered' ? 1 : 0),
                        verified:
                            previous.verification.verified +
                            (current.result === 'OK' ||
                            current.result === 'AlreadyVerified'
                                ? 1
                                : 0),
                        running:
                            previous.verification.running +
                            (current.relay.running ? 1 : 0),
                    },
                    verified_and_running: {
                        consensus_weight:
                            previous.verified_and_running.consensus_weight +
                            ((current.result === 'OK' ||
                                current.result === 'AlreadyVerified') &&
                            current.relay.running
                                ? current.relay.consensus_weight
                                : 0),
                        observed_bandwidth:
                            previous.verified_and_running.observed_bandwidth +
                            ((current.result === 'OK' ||
                                current.result === 'AlreadyVerified') &&
                            current.relay.running
                                ? current.relay.observed_bandwidth
                                : 0),
                    },
                }
            },
            {
                consensus_weight: 0,
                observed_bandwidth: 0,
                verification: {
                    failed: 0,
                    unclaimed: 0,
                    verified: 0,
                    running: 0,
                },
                verified_and_running: {
                    consensus_weight: 0,
                    observed_bandwidth: 0,
                },
            },
        )
    }

    public async persistVerification(
        data: VerificationResults,
    ): Promise<VerificationData> {
        const verificationStamp = Date.now()

        const verifiedRelays = data.filter(
            (value, index, array) =>
                value.result === 'OK' || value.result === 'AlreadyVerified',
        )

        const relayMetricsTx = await this.storeRelayMetrics(
            verificationStamp,
            verifiedRelays,
        )

        const validationStats: RelayValidationStatsDto = this.getValidationStats(data)

        const validationStatsTx = await this.storeValidationStats(
            verificationStamp,
            validationStats,
        )

        const verificationData: VerificationData = {
            verified_at: verificationStamp,
            relay_metrics_tx: relayMetricsTx,
            validation_stats_tx: validationStatsTx,
            relays: data.map(
                (result, index, array) => result.relay,
            ),
        }

        this.verificationDataModel
            .create<VerificationData>(verificationData)
            .catch((error) => this.logger.error(error))

        return verificationData
    }

    public logVerification(data: VerificationResults) {
        const failed = data.filter(
            (value, index, array) => value.result === 'Failed',
        )
        if (failed.length > 0) {
            this.logger.log(
                `Failed verification of ${failed.length} relay(s): [${failed
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

        const verifiedRelays = data.filter(
            (value, index, array) =>
                value.result === 'OK' || value.result === 'AlreadyVerified',
        )

        this.logger.log(`Total verified relays: ${verifiedRelays.length}`)
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
                relay.ator_address,
                state,
            )

            this.logger.debug(
                `${relay.fingerprint}|${relay.ator_address} IS_LIVE: ${this.isLive} Registered: ${registered} Verified: ${verified}`,
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
                        const response = await this.contract
                            .connect({
                                signer: evmSig,
                                type: 'ethereum',
                            })
                            .writeInteraction<Verify>({
                                function: 'verify',
                                fingerprint: relay.fingerprint,
                                address: relay.ator_address,
                            })

                        this.logger.log(
                            `Verified validated relay [${relay.fingerprint}]: ${response?.originalTxId}`,
                        )
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
                this.logger.debug(
                    `Skipping not registered relay [${relay.fingerprint}]`,
                )
                return 'NotRegistered'
            }
        } else {
            this.logger.error('Contract not initialized')
            return 'Failed'
        }
    }
}
