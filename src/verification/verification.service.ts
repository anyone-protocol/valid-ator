import { Injectable, Logger } from '@nestjs/common'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import {
    AddClaimable,
    IsClaimable,
    IsVerified,
    RelayRegistryState,
} from './interfaces/relay-registry'
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

    private relayRegistryWarp: Warp
    private relayRegistryContract: Contract<RelayRegistryState>

    private maxUploadRetries = 3

    constructor(
        private readonly config: ConfigService<{
            RELAY_REGISTRY_OPERATOR_KEY: string
            RELAY_REGISTRY_CONTRACT_TXID: string
            IS_LIVE: string
            BUNDLR_NODE: string
            BUNDLR_NETWORK: string
            DISTRIBUTION_CONTRACT_TXID: string
        }>,
        @InjectModel(VerificationData.name)
        private readonly verificationDataModel: Model<VerificationData>,
    ) {
        LoggerFactory.INST.logLevel('error')

        this.isLive = config.get<string>('IS_LIVE', { infer: true })

        this.logger.log(
            `Initializing verification service (IS_LIVE: ${this.isLive})`,
        )

        const relayRegistryOperatorKey = this.config.get<string>(
            'RELAY_REGISTRY_OPERATOR_KEY',
            {
                infer: true,
            },
        )

        if (relayRegistryOperatorKey !== undefined) {
            this.bundlr = (() => {
                const node = config.get<string>('BUNDLR_NODE', {
                    infer: true,
                })
                const network = config.get<string>('BUNDLR_NETWORK', {
                    infer: true,
                })

                if (node !== undefined && network !== undefined) {
                    return new Bundlr(node, network, relayRegistryOperatorKey)
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

            const signer = new Wallet(relayRegistryOperatorKey)

            this.owner = {
                address: signer.address,
                key: relayRegistryOperatorKey,
                signer: signer,
            }

            this.logger.log(`Initialized for address: ${this.owner.address}`)

            const registryTxId = this.config.get<string>(
                'RELAY_REGISTRY_CONTRACT_TXID',
                {
                    infer: true,
                },
            )

            if (registryTxId !== undefined) {
                this.logger.log(
                    `Initialized with relay-registry: ${registryTxId}`,
                )

                this.relayRegistryWarp = WarpFactory.forMainnet({
                    inMemory: true,
                    dbLocation: '-relay-registry',
                })
                    .use(new EthersExtension())
                    .use(new EvmSignatureVerificationServerPlugin())
                this.relayRegistryWarp.use(
                    new StateUpdatePlugin(registryTxId, this.relayRegistryWarp),
                )

                this.relayRegistryContract =
                    this.relayRegistryWarp.contract<RelayRegistryState>(
                        registryTxId,
                    )
            } else this.logger.error('Missing relay registry contract txid')
        } else this.logger.error('Missing contract owner key...')
    }

    private async isVerified(fingerprint: string): Promise<boolean> {
        const interactionResult = await this.relayRegistryContract.viewState<
            IsVerified,
            boolean
        >({
            function: 'isVerified',
            fingerprint: fingerprint,
        })

        return interactionResult.result
    }

    public async isClaimable(
        fingerprint: string,
        address: string,
    ): Promise<boolean> {
        const interactionResult = await this.relayRegistryContract.viewState<
            IsClaimable,
            boolean
        >({
            function: 'isClaimable',
            fingerprint: fingerprint,
            address: address,
        })

        return interactionResult.result
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

                this.logger.log(
                    `Permanently stored validation/stats ${stamp}: ${response.id}`,
                )

                return response.id
            } else {
                this.logger.warn(
                    `NOT LIVE: Not storing validation/stats ${stamp}`,
                )
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
                    consensus_weight_fraction:
                        previous.consensus_weight_fraction +
                        current.relay.consensus_weight_fraction,
                    observed_bandwidth:
                        previous.observed_bandwidth +
                        current.relay.observed_bandwidth,
                    verification: {
                        failed:
                            previous.verification.failed +
                            (current.result === 'Failed' ? 1 : 0),
                        unclaimed:
                            previous.verification.unclaimed +
                            (current.result === 'AlreadyRegistered' ? 1 : 0),
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
                        consensus_weight_fraction:
                            previous.verified_and_running
                                .consensus_weight_fraction +
                            ((current.result === 'OK' ||
                                current.result === 'AlreadyVerified') &&
                            current.relay.running
                                ? current.relay.consensus_weight_fraction
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
                consensus_weight_fraction: 0,
                observed_bandwidth: 0,
                verification: {
                    failed: 0,
                    unclaimed: 0,
                    verified: 0,
                    running: 0,
                },
                verified_and_running: {
                    consensus_weight: 0,
                    consensus_weight_fraction: 0,
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
            (value, index, array) => value.result === 'AlreadyVerified',
        )

        let relayMetricsTx = 'missing'
        try {
            relayMetricsTx = await this.storeRelayMetrics(
                verificationStamp,
                verifiedRelays,
            )
        } catch (e) {
            this.logger.warn(`Failed to store relay metrics: ${e}`)
        }

        let validationStatsTx = 'missing'
        try {
            const validationStats: RelayValidationStatsDto =
                this.getValidationStats(data)

            validationStatsTx = await this.storeValidationStats(
                verificationStamp,
                validationStats,
            )
        } catch (e) {
            this.logger.warn(
                `Failed generating / storing validation stats: ${e}`,
            )
        }

        const verificationData: VerificationData = {
            verified_at: verificationStamp,
            relay_metrics_tx: relayMetricsTx,
            validation_stats_tx: validationStatsTx,
            relays: verifiedRelays.map((result, index, array) => result.relay),
        }

        await this.verificationDataModel
            .create<VerificationData>(verificationData)
            .catch((error) => this.logger.error(error))

        return verificationData
    }

    public async getMostRecent(): Promise<VerificationData | null> {
        return await this.verificationDataModel
            .findOne({})
            .sort({ verified_at: -1 })
            .exec()
            .catch((error) => {
                this.logger.error(error)
                return null
            })
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

        const claimable = data.filter(
            (value, index, array) => value.result === 'AlreadyRegistered',
        )
        if (claimable.length > 0) {
            this.logger.log(
                `Skipped ${
                    claimable.length
                } already registered/claimable relay(s): [${claimable
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
            this.logger.log(
                `Registered (for user claims) ${ok.length} relay(s)`,
            )
        }

        const verifiedRelays = data.filter(
            (value, index, array) => value.result === 'AlreadyVerified',
        )

        this.logger.log(`Total verified relays: ${verifiedRelays.length}`)
    }

    public async verifyRelay(
        relay: ValidatedRelay,
    ): Promise<RelayVerificationResult> {
        if (
            this.relayRegistryContract !== undefined &&
            this.owner !== undefined
        ) {
            const verified: boolean = await this.isVerified(relay.fingerprint)
            const claimable: boolean = await this.isClaimable(
                relay.fingerprint,
                relay.ator_address,
            )

            this.logger.debug(
                `${relay.fingerprint}|${relay.ator_address} IS_LIVE: ${this.isLive} Claimable: ${claimable} Verified: ${verified}`,
            )

            if (verified) {
                this.logger.debug(
                    `Already verified relay [${relay.fingerprint}]`,
                )
                return 'AlreadyVerified'
            }

            if (claimable) {
                this.logger.debug(
                    `Already registered (can be claimed) relay [${relay.fingerprint}]`,
                )
                return 'AlreadyRegistered'
            }

            if (this.isLive === 'true') {
                const evmSig = await buildEvmSignature(this.owner.signer)
                const response = await this.relayRegistryContract
                    .connect({
                        signer: evmSig,
                        type: 'ethereum',
                    })
                    .writeInteraction<AddClaimable>({
                        function: 'addClaimable',
                        fingerprint: relay.fingerprint,
                        address: relay.ator_address,
                    })

                this.logger.log(
                    `Added a claimable relay [${relay.fingerprint}]: ${response?.originalTxId}`,
                )
            } else {
                this.logger.warn(
                    `NOT LIVE - skipped contract call to add a claimable relay [${relay.fingerprint}]`,
                )
            }

            return 'OK'
        } else {
            this.logger.error(
                'Contract not initialized or validator key not defined',
            )
            return 'Failed'
        }
    }
}
