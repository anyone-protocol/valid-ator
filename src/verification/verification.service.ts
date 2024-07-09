import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom, catchError } from 'rxjs'
import { Contract, LoggerFactory, Tag, Warp, WarpFactory } from 'warp-contracts'
import {
    AddClaimable,
    AddClaimableBatched,
    AddRegistrationCredits,
    IsClaimable,
    IsVerified,
    RelayRegistryState,
    SetFamilies
} from './interfaces/relay-registry'
import { ConfigService } from '@nestjs/config'
import { Wallet, toUtf8Bytes } from 'ethers'
import {
    EthereumSigner,
    // @ts-ignore
} from 'warp-contracts-plugin-signature/server'
import { EthersExtension } from 'warp-contracts-plugin-ethers'
import { StateUpdatePlugin } from 'warp-contracts-subscription-plugin'
import { RelayVerificationResult } from './dto/relay-verification-result'
import { VerificationData } from './schemas/verification-data'
import { VerifiedHardware } from './schemas/verified-hardware'
import { VerificationResults } from './dto/verification-result-dto'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import { Model } from 'mongoose'
import { InjectModel } from '@nestjs/mongoose'
import Bundlr from '@bundlr-network/client'
import { RelayValidationStatsDto } from './dto/relay-validation-stats'
import { p256 } from '@noble/curves/p256'
import { bytesToHex } from '@noble/curves/abstract/utils'
import { createHash } from 'crypto'
import { ECPointCompress } from '../util/ec-point-compress'
import { isFingerprintValid } from '../util/fingerprint'
import { isAddressValid } from '../util/address-evm'
import { isHexStringValid } from '../util/hex-string'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'
import { DreRelayRegistryResponse } from './interfaces/dre-relay-registry-response'
import { setTimeout } from 'node:timers/promises'

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name)

    private isLive?: string

    private operator
    private bundlr

    private relayRegistryWarp: Warp
    private relayRegistryContract: Contract<RelayRegistryState>

    private relayRegistryDreUri: string
    private dreState: RelayRegistryState | undefined
    private dreStateStamp: number | undefined

    constructor(
        private readonly config: ConfigService<{
            RELAY_REGISTRY_OPERATOR_KEY: string
            RELAY_REGISTRY_CONTRACT_TXID: string
            IS_LIVE: string
            IRYS_NODE: string
            IRYS_NETWORK: string
            DISTRIBUTION_CONTRACT_TXID: string
            DRE_HOSTNAME: string
        }>,
        @InjectModel(VerificationData.name)
        private readonly verificationDataModel: Model<VerificationData>,
        @InjectModel(VerifiedHardware.name)
        private readonly verifiedHardwareModel: Model<VerifiedHardware>,
        private readonly httpService: HttpService
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
                const node = config.get<string>('IRYS_NODE', {
                    infer: true,
                })
                const network = config.get<string>('IRYS_NETWORK', {
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

            const signer = new EthereumSigner(relayRegistryOperatorKey)

            this.operator = {
                address: signer.address,
                signer: signer,
            }

            this.logger.log(`Initialized for address: ${this.operator.address}`)

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
                    dbLocation: '-relay-registry-testnet',
                })
                    .use(new EthersExtension())
                this.relayRegistryWarp.use(
                    new StateUpdatePlugin(registryTxId, this.relayRegistryWarp),
                )

                const dreHostname = this.config.get<string>('DRE_HOSTNAME', {
                    infer: true,
                })

                this.relayRegistryDreUri = `${dreHostname}?id=${registryTxId}`

                this.relayRegistryContract = this.relayRegistryWarp
                    .contract<RelayRegistryState>(registryTxId)
                    .setEvaluationOptions({
                        remoteStateSyncEnabled: true,
                        remoteStateSyncSource: dreHostname ?? 'dre-1.warp.cc',
                    })
                    .connect(this.operator.signer)
            } else this.logger.error('Missing relay registry contract txid')
        } else this.logger.error('Missing contract owner key...')
    }

    public async addRegistrationCredit(address: string, tx: string, fingerprint: string): Promise<boolean> {
        if (
            this.relayRegistryContract !== undefined &&
            this.operator !== undefined
        ) {
            if (this.isLive === 'true') {
                try {
                    // TODO: make use of fingerprint
                    const response = await this.relayRegistryContract
                        .writeInteraction<AddRegistrationCredits>({
                            function: 'addRegistrationCredits',
                            credits: [{ address, fingerprint }]
                        }, {
                            tags: [ new Tag('EVM-TX', tx) ]
                        })

                    this.logger.log(
                        `Added registration credit to [${address}|${fingerprint}]: ${response?.originalTxId??"no-tx-id"}`,
                    )
                } catch (error) {
                    this.logger.error(
                        `Exception when adding registration credit [${address}]`,
                        error.stack,
                    )
                    return false
                }
            } else {
                this.logger.warn(
                    `NOT LIVE - skipped contract call to add registration credit to ${address}`,
                )
            }

            return true
        } else {
            this.logger.error(
                'Contract not initialized or validator key not defined',
            )
            return false
        }
    }

    public async getFamilies(): Promise<RelayRegistryState['families']> {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            return this.dreState?.families || {}
        } else {
            const {
                cachedValue: { state }
            } = await this.relayRegistryContract.readState()
            return state.families || {}
        }
    }

    public async getFamily(fingerprint: string): Promise<string[]> {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            return (this.dreState?.families || {})[fingerprint] || []
        } else {
            const {
                cachedValue: { state }
            } = await this.relayRegistryContract.readState()
            return (state.families || {})[fingerprint] || []
        }
    }

    async storeRelayHexMap(data: VerificationResults) {
        if (this.bundlr !== undefined) {
            if (this.isLive === 'true') {
                try {
                    let stamp = Date.now()
                    
                    const grouped = data.reduce((curr, item) => {
                            (curr[item.relay.primary_address_hex] ||= []).push(item)
                            return curr
                        }, {} as Record<string, VerificationResults>)
                    const filled = []
                    for (const hex_id in grouped) {
                        filled.push({
                            h3cell: hex_id,
                            claimable: grouped[hex_id].filter((v) => v.result == 'OK' || v.result == 'AlreadyRegistered').length,
                            verified: grouped[hex_id].filter((v) => v.result == 'AlreadyVerified').length,
                            running: grouped[hex_id].filter((v) => v.relay.running).length,
                            running_verified: grouped[hex_id].filter((v) => v.relay.running && v.result == 'AlreadyVerified').length,
                        })
                    }
                    
                    const response = await this.bundlr?.upload(
                        JSON.stringify(filled),
                        {
                            tags: [
                                { name: 'Protocol', value: 'ator' },
                                { name: 'Protocol-Version', value: '0.1' },
                                {
                                    name: 'Content-Timestamp',
                                    value: stamp.toString(),
                                },
                                {
                                    name: 'Content-Type',
                                    value: 'application/json',
                                },
                                { name: 'Entity-Type', value: 'relay/hex-map' },
                            ],
                        },
                    )
                    this.logger.log(
                        `Permanently stored relay hex map ${stamp} with ${data.length} relay(s): ${response.id} `,
                    )
                    return response.id
                } catch (error) {
                    this.logger.warn(
                        `Exception when storing relay hex map: ${error}`, error.stack
                    )
                }
            } else {
                this.logger.warn(
                    `NOT LIVE: Not storing relay hex map`,
                )
                return 'not-live-skipped-store-relay-hex-map'
            }
        } else {
            this.logger.error(
                'Bundler not initialized, not persisting relay hex map',
            )
        }
        return ''
    }

    private async storeRelayMetrics(
        stamp: number,
        data: VerificationResults,
    ): Promise<string> {
        if (this.bundlr !== undefined) {
            if (this.isLive === 'true') {
                try {
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
                                {
                                    name: 'Content-Type',
                                    value: 'application/json',
                                },
                                { name: 'Entity-Type', value: 'relay/metrics' },
                            ],
                        },
                    )
                    this.logger.log(
                        `Permanently stored relay/metrics ${stamp} with ${data.length} relay(s): ${response.id} `,
                    )
                    return response.id
                } catch (e) {
                    this.logger.warn(
                        `Exception when storing relay metrics: ${e}`,
                    )
                }
            } else {
                this.logger.warn(
                    `NOT LIVE: Not storing relay/metrics ${stamp} with ${data.length} relay(s) `,
                )
                return 'not-live-skipped-store-relay-metrics'
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
                try {
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
                                {
                                    name: 'Content-Type',
                                    value: 'application/json',
                                },
                                {
                                    name: 'Entity-Type',
                                    value: 'validation/stats',
                                },
                            ],
                        },
                    )

                    this.logger.log(
                        `Permanently stored validation/stats ${stamp}: ${response.id}`,
                    )

                    return response.id
                } catch (e) {
                    this.logger.warn(
                        `Exception when storing validation stats: ${e}`,
                    )
                }
            } else {
                this.logger.warn(
                    `NOT LIVE: Not storing validation/stats ${stamp}`,
                )
                return 'not-live-skipped-store-validation-stats'
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
                            ((current.result === 'OK' ||
                                current.result === 'AlreadyRegistered') ? 1 : 0),
                        verified:
                            previous.verification.verified +
                            (current.result === 'AlreadyVerified'
                                ? 1
                                : 0),
                        running:
                            previous.verification.running +
                            (current.relay.running ? 1 : 0),
                    },
                    verified_and_running: {
                        consensus_weight:
                            previous.verified_and_running.consensus_weight +
                            ((current.result === 'AlreadyVerified') &&
                            current.relay.running
                                ? current.relay.consensus_weight
                                : 0),
                        consensus_weight_fraction:
                            previous.verified_and_running
                                .consensus_weight_fraction +
                            ((current.result === 'AlreadyVerified') &&
                            current.relay.running
                                ? current.relay.consensus_weight_fraction
                                : 0),
                        observed_bandwidth:
                            previous.verified_and_running.observed_bandwidth +
                            ((current.result === 'AlreadyVerified') &&
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
        metricsTx: string,
        statsTx: string,
    ): Promise<VerificationData> {
        const verificationStamp = Date.now()
        const verifiedRelays = data.filter(
            (value) => value.result === 'AlreadyVerified',
        )

        const relayMetricsTx =
            metricsTx != ''
                ? metricsTx
                : await this.storeRelayMetrics(
                      verificationStamp,
                      verifiedRelays,
                  )

        let validationStatsTx = ''

        const validationStats: RelayValidationStatsDto =
            this.getValidationStats(data)

        validationStatsTx =
            statsTx != ''
                ? statsTx
                : await this.storeValidationStats(
                      verificationStamp,
                      validationStats,
                  )

        const verificationData: VerificationData = {
            verified_at: verificationStamp,
            relay_metrics_tx: relayMetricsTx,
            validation_stats_tx: validationStatsTx,
            relays: verifiedRelays.map((result) => result.relay),
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
            this.logger.warn(
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
                `Skipped ${claimable.length} already registered/claimable relay(s)`,
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

    public async setRelayFamilies(
        relays: ValidatedRelay[]
    ): Promise<VerificationResults> {
        const results: VerificationResults = []

        if (!this.relayRegistryContract) {
            this.logger.error('Relay registry contract not initialized')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        if (!this.operator) {
            this.logger.error('Relay registry operator not defined')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        // NB: Only update relay families that need to be updated
        const families = await this.getFamilies()
        const relaysWithFamilyUpdates: ValidatedRelay[] = []
        for (const relay of relays) {
            const incomingFamilyHash = (relay.family || [])
                .slice()
                .sort()
                .join('')
            const contractFamilyHash = (families[relay.fingerprint] || [])
                .slice()
                .sort()
                .join('')
            
            if (incomingFamilyHash !== contractFamilyHash) {
                relaysWithFamilyUpdates.push(relay)
            } else {
                results.push({
                    relay,
                    result: 'AlreadyVerified' // TODO -> 'AlreadySetFamily' ?
                })
            }
        }

        if (this.isLive === 'true') {
            try {
                await setTimeout(5000)
                this.logger.debug(
                    `Starting to set relay families for ${relaysWithFamilyUpdates.length} relays [${relaysWithFamilyUpdates.map(r => r.fingerprint)}]`,
                )
                const response = await this.relayRegistryContract
                    .writeInteraction<SetFamilies>({
                        function: 'setFamilies',
                        families: relaysWithFamilyUpdates.map(
                            ({ fingerprint, family }) =>
                                ({ fingerprint, family })
                        )
                    })

                this.logger.log(
                    `Set relay families for ${relaysWithFamilyUpdates.length} relays: ${response?.originalTxId}`,
                )
            } catch (error) {
                this.logger.error(
                    `Exception setting relay families for ${relaysWithFamilyUpdates.length} relays [${relaysWithFamilyUpdates.map(r => r.fingerprint)}]`,
                    error.stack,
                )

                return results.concat(
                    relays.map(relay => ({ relay, result: 'Failed' }))
                )
            }
        } else {
            this.logger.warn(
                `NOT LIVE - skipped setting relay families for ${relaysWithFamilyUpdates.length} relays [${relaysWithFamilyUpdates.map(r => r.fingerprint)}]`
            )
        }

        return results.concat(
            relaysWithFamilyUpdates.map(relay => ({ relay, result: 'OK' }))
        )
    }

    private async refreshDreState(forced: boolean = false) {
        const now = Date.now()
        if (forced || this.dreStateStamp == undefined || now > (this.dreStateStamp + 60_000)) {
            try {
                const { headers, status, data } = await firstValueFrom(
                    this.httpService
                        .get<DreRelayRegistryResponse>(this.relayRegistryDreUri)
                        .pipe(
                            catchError((error: AxiosError) => {
                                this.logger.error(
                                    `Fetching dre state of relay registry from ${this.relayRegistryDreUri} failed with ${error.response?.status}, ${error}`,
                                )
                                throw 'Failed to fetch relay registry contract cache from dre'
                            }),
                        ),
                )

                if (status === 200) {
                    this.dreState = data.state
                    this.dreStateStamp = Date.now()
                    this.logger.debug(
                        `Refreshed relay registry dre state at ${this.dreStateStamp}`,
                    )
                }
            } catch (e) {
                this.logger.error('Exception when fetching relay registry dre cache', e.stack)
            }
        } else this.logger.debug(`DRE cache warm ${now - this.dreStateStamp}, skipping refresh`)
    }

    private async getRelayRegistryStatuses(): Promise<
        Pick<RelayRegistryState, 'claimable' | 'verified'>
    > {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            const { claimable, verified } = this.dreState

            return { claimable, verified }
        } else {
            const {
                cachedValue: { state: { claimable, verified } }
            } = await this.relayRegistryContract.readState()

            return { claimable, verified }
        }
    }

    public async verifyRelays(
        relays: ValidatedRelay[]
    ): Promise<VerificationResults> {
        const results: VerificationResults = []

        if (!this.relayRegistryContract) {
            this.logger.error('Relay registry contract not initialized')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        if (!this.operator) {
            this.logger.error('Relay registry operator not defined')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        // NB: Filter out already claimed or verified relays
        const {
            claimable,
            verified
        } = await this.getRelayRegistryStatuses()
        const alreadyClaimableFingerprints = Object.keys(claimable)
        const alreadyVerifiedFingerprints = Object.keys(verified)
        const relaysToAddAsClaimable: {
            relay: ValidatedRelay,
            isHardwareProofValid?: boolean
        }[] = []
        for (const relay of relays) {
            const isAlreadyClaimable = alreadyClaimableFingerprints.includes(
                relay.fingerprint
            )
            const isAlreadyVerified = alreadyVerifiedFingerprints.includes(
                relay.fingerprint
            )

            this.logger.debug(
                `${relay.fingerprint}|${relay.ator_address} IS_LIVE: ${this.isLive} Claimable: ${isAlreadyClaimable} Verified: ${isAlreadyVerified}`,
            )

            if (isAlreadyClaimable) {
                this.logger.debug(
                    `Already registered (can be claimed) relay [${relay.fingerprint}]`,
                )
                results.push({ relay, result: 'AlreadyRegistered' })
            } else if (isAlreadyVerified) {
                this.logger.debug(
                    `Already verified relay [${relay.fingerprint}]`,
                )
                results.push({ relay, result: 'AlreadyVerified' })
            } else if (!relay.hardware_info) {
                relaysToAddAsClaimable.push({ relay })
            } else {
                const isHardwareProofValid = await this
                    .isHardwareProofValid(relay)
                if (isHardwareProofValid) {
                    relaysToAddAsClaimable.push({relay, isHardwareProofValid })
                } else {
                    results.push({ relay, result: 'HardwareProofFailed' })
                }
            }
        }

        if (this.isLive === 'true') {
            try {
                await setTimeout(5000)
                const response = await this.relayRegistryContract
                    .writeInteraction<AddClaimableBatched>({
                        function: 'addClaimableBatched',
                        relays: relaysToAddAsClaimable.map(
                            ({
                                relay: {
                                    fingerprint,
                                    ator_address,
                                    nickname
                                }
                            }) => ({
                                fingerprint,
                                address: ator_address,
                                nickname
                            })
                        )
                    })

                this.logger.log(
                    `Added ${relaysToAddAsClaimable.length} claimable relays: ${response?.originalTxId}`,
                )
            } catch (error) {
                this.logger.error(
                    `Exception when verifying relays [${relaysToAddAsClaimable.map(({ relay }) => relay.fingerprint)}]`,
                    error.stack,
                )

                return results.concat(
                    relaysToAddAsClaimable.map(
                        ({ relay }) => ({ relay, result: 'Failed' })
                    )
                )
            }
        } else {
            this.logger.warn(
                `NOT LIVE - skipped contract call to add ${relaysToAddAsClaimable.length} claimable relays`,
            )
        }

        return results.concat(
            relaysToAddAsClaimable.map(({ relay }) => ({ relay, result: 'OK' }))
        )
    }

    private async isHardwareProofValid(
        relay: ValidatedRelay
    ): Promise<boolean> {
        if (!relay.hardware_info) { return false }

        const { nftid, serNums, pubKeys, certs } = relay.hardware_info

        if (!nftid) {
            this.logger.debug(
                `Missing NFT ID in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }
        const parsedNftId = Number.parseInt(nftid)
        // TODO -> check id is within range of IDs in contract(s)?
        //         nftIds are not sequential :)
        //         isNftIdValid should be false if failing this ^
        const isNftIdValid = Number.isInteger(parsedNftId)
        if (!isNftIdValid) {
            this.logger.debug(
                `Invalid NFT ID [${parsedNftId}] in hardware info for relay [${relay.fingerprint}]`
            )
        }
        // TODO -> check if address owns nft id
        const existingVerifiedHardwareByNftId = await this
            .verifiedHardwareModel
            .exists({ nftId: parsedNftId })
            .exec()
        if (existingVerifiedHardwareByNftId) {
            this.logger.debug(
                `NFT ID [${parsedNftId}] already verified in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }

        const deviceSerial = serNums
            ?.find(s => s.type === 'DEVICE')
            ?.number
        if (!deviceSerial) {
            this.logger.debug(
                `Missing Device Serial in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }
        const existingVerifiedHardwareByDeviceSerial = await this
            .verifiedHardwareModel
            .exists({ deviceSerial })
            .exec()
        if (existingVerifiedHardwareByDeviceSerial) {
            this.logger.debug(`Device Serial [${deviceSerial}] already verified for relay [${relay.fingerprint}]`)

            return false
        }

        const atecSerial = serNums
            ?.find(s => s.type === 'ATEC')
            ?.number
        if (!atecSerial) {
            this.logger.debug(
                `Missing ATEC Serial in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }

        const existingVerifiedHardwareByAtecSerial = await this
            .verifiedHardwareModel
            .exists({ atecSerial })
            .exec()
        if (existingVerifiedHardwareByAtecSerial) {
            this.logger.debug(`ATEC Serial [${atecSerial}] already verified for relay [${relay.fingerprint}]`)

            return false
        }

        const publicKey = pubKeys
            ?.find(p => p.type === 'DEVICE')
            ?.number
        if (!publicKey) {
            this.logger.debug(
                `Missing Public Key in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }

        const signature = certs
            ?.find(c => c.type === 'DEVICE')
            ?.signature
        if (!signature) {
            this.logger.debug(
                `Missing Signature in hardware info for relay [${relay.fingerprint}]`
            )

            return false
        }

        const isHardwareProofValid = await this.verifyRelaySerial(
            'relay',
            parsedNftId,
            deviceSerial,
            atecSerial,
            relay.fingerprint,
            relay.ator_address,
            publicKey,
            signature
        )

        if (!isHardwareProofValid) {
            this.logger.debug(
                `Hardware info proof failed verification for relay [${relay.fingerprint}]`
            )

            return false
        }

        await this.verifiedHardwareModel.create({
            verified_at: Date.now(),
            deviceSerial,
            atecSerial,
            fingerprint: relay.fingerprint,
            address: relay.ator_address,
            publicKey,
            signature,
            nftId: nftid ? parsedNftId : undefined
        })

        return true
    }

    public async verifyRelaySerial(
        nodeId: string,
        nftId: number,
        deviceSerial: string,
        atecSerial: string,
        fingerprint: string,
        address: string,
        publicKey: string,
        signature: string
    ) {
        if (!isFingerprintValid(fingerprint)) {
            this.logger.error('Invalid fingerprint', fingerprint)

            return false
        }

        if (!isAddressValid(address)) {
            this.logger.error('Invalid address', address)

            return false
        }

        const nodeIdHex = bytesToHex(toUtf8Bytes(nodeId))

        const isDeviceSerialValid = deviceSerial.length === 16
            && isHexStringValid(deviceSerial)
        if (!isDeviceSerialValid) {
            this.logger.error('Invalid device serial', deviceSerial)

            return false
        }

        const isAtecSerialValid = atecSerial.length === 18
            && isHexStringValid(atecSerial)
        if (!isAtecSerialValid) {
            this.logger.error('Invalid atec serial', atecSerial)

            return false
        }

        const isSignatureFormatValid = signature.length === 128
            && isHexStringValid(signature)
        if (!isSignatureFormatValid) {
            this.logger.error('Invalid signature', signature)

            return false
        }

        const nftIdHex = nftId.toString(16).padStart(4, '0')
        const nftIdHexLsb = [
            nftIdHex[2],
            nftIdHex[3],
            nftIdHex[0],
            nftIdHex[1]
        ].join('')
        const messageHexString = (
            nodeIdHex
            + nftIdHexLsb
            + deviceSerial
            + atecSerial
            + fingerprint
            + address
        ).toLowerCase()
        const message = Uint8Array.from(
            (messageHexString.match(/.{1,2}/g) || [])
                .map((byte) => parseInt(byte, 16))
        )
        const messageHash = createHash('sha256').update(message).digest('hex')
        const publicKeyBytes = Uint8Array.from(
            (publicKey.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))
        )
        const publicKeyCompressed = ECPointCompress(
            publicKeyBytes.slice(0, publicKeyBytes.length / 2),
            publicKeyBytes.slice(publicKeyBytes.length / 2)
        )

        return p256.verify(signature, messageHash, publicKeyCompressed)
    }
}
