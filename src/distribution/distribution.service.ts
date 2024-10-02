import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom, catchError } from 'rxjs'
import { DistributionData } from './schemas/distribution-data'
import { ScoreData } from './schemas/score-data'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import {
    AddFingerprintsToBonus,
    AddScores,
    DistributionResult,
    DistributionState,
    Score,
    SetFamilies,
    SetQualityTierUptimes,
} from 'src/distribution/interfaces/distribution'
import { ConfigService } from '@nestjs/config'
import { EthersExtension } from 'warp-contracts-plugin-ethers'
import {
    EthereumSigner,
    // @ts-ignore
} from 'warp-contracts-plugin-signature/server'
// import {
//     buildEvmSignature,
//     EvmSignatureVerificationServerPlugin,
//     // @ts-ignore
// } from 'warp-contracts-plugin-signature/server'
import { StateUpdatePlugin } from 'warp-contracts-subscription-plugin'
import Bundlr from '@bundlr-network/client'
import { Distribute } from './interfaces/distribution'
import { RewardAllocationData } from './dto/reward-allocation-data'
import { Claimable } from 'src/verification/interfaces/relay-registry'
import { setTimeout } from 'node:timers/promises'
import { AxiosError } from 'axios'
import {
    DreDistributionResponse
} from './interfaces/dre-relay-registry-response'
import { HttpService } from '@nestjs/axios'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import {
    VerificationResults
} from 'src/verification/dto/verification-result-dto'
import _ from 'lodash'
import { RelayUptime } from 'src/validation/schemas/relay-uptime'

@Injectable()
export class DistributionService {
    private readonly logger = new Logger(DistributionService.name)

    private isLive?: string
    private operator

    private static readonly scoresPerBatch = 7
    public static readonly maxDistributionRetries = 6
    private static readonly familiesPerBatch = 4
    private static readonly bigFamilyThreshold = 50
    private static readonly fingerprintsPerBatch = 50

    private distributionWarp: Warp
    private distributionContract: Contract<DistributionState>

    private distributionDreUri: string
    private dreState: DistributionState | undefined
    private dreStateStamp: number | undefined
    private dreRefreshDelay: number = 2_500

    private bundlr

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
            DISTRIBUTION_CONTRACT_TXID: string
            DISTRIBUTION_OPERATOR_KEY: string
            DRE_HOSTNAME: string
            IRYS_NODE: string
            IRYS_NETWORK: string
        }>,
        private readonly httpService: HttpService,
    ) {
        LoggerFactory.INST.logLevel('error')

        this.isLive = config.get<string>('IS_LIVE', { infer: true })

        this.logger.log(
            `Initializing distribution service (IS_LIVE: ${this.isLive})`,
        )

        const distributionOperatorKey = this.config.get<string>(
            'DISTRIBUTION_OPERATOR_KEY',
            {
                infer: true,
            },
        )

        if (distributionOperatorKey !== undefined) {
            this.bundlr = (() => {
                const node = config.get<string>('IRYS_NODE', {
                    infer: true,
                })
                const network = config.get<string>('IRYS_NETWORK', {
                    infer: true,
                })
                if (node !== undefined && network !== undefined) {
                    return new Bundlr(node, network, distributionOperatorKey)
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

            this.operator = new EthereumSigner(distributionOperatorKey)

            const distributionContractTxId = this.config.get<string>(
                'DISTRIBUTION_CONTRACT_TXID',
                {
                    infer: true,
                },
            )

            if (distributionContractTxId != undefined) {
                this.logger.log(
                    `Initialized distribution contract: ${distributionContractTxId}`,
                )

                this.distributionWarp = WarpFactory.forMainnet({
                    inMemory: true,
                    dbLocation: '-distribution',
                })
                    .use(new EthersExtension())
                    
                this.distributionWarp.use(
                    new StateUpdatePlugin(
                        distributionContractTxId,
                        this.distributionWarp,
                    ),
                )

                const dreHostname = this.config.get<string>('DRE_HOSTNAME', {
                    infer: true,
                })

                this.distributionDreUri = `${dreHostname}?id=${distributionContractTxId}`

                this.distributionContract = this.distributionWarp
                    .contract<DistributionState>(distributionContractTxId)
                    .setEvaluationOptions({
                        remoteStateSyncEnabled: true,
                        remoteStateSyncSource: dreHostname ?? 'dre-1.warp.cc',
                    })
                    .connect(this.operator)
            } else this.logger.error('Missing distribution contract txid')
        } else this.logger.error('Missing contract owner key...')
    }

    async onApplicationBootstrap(): Promise<void> {
        if (this.operator !== undefined) {
            const operatorAddress = await this.operator.getAddress()
            this.logger.log(`Initialized with operator address: ${operatorAddress}`)
        } else {
            this.logger.error('Operator is undefined!')
        }
    }

    public async getAllocation(
        address: string,
    ): Promise<RewardAllocationData | undefined> {
        if (this.operator != undefined) {
            try {
                const response = await this.distributionContract
                    .viewState<Claimable, string>({
                        function: 'claimable',
                        address: address,
                    })

                if (response.result == undefined) {
                    this.logger.error(
                        `Failed to fetch distribution state: ${response.errorMessage}`,
                    )
                    return undefined
                } else {
                    return {
                        address: address,
                        amount: response.result,
                    }
                }
            } catch (error) {
                this.logger.error(`Exception in getAllocation:`, error.stack)
                return undefined
            }
        } else {
            this.logger.error(
                `Owner is undefined. Failed get distribution data`,
            )
            return undefined
        }
    }

    public groupScoreJobs(data: DistributionData): ScoreData[][] {
        const result = data.scores.reduce<ScoreData[][]>(
            (curr, score, index, array): ScoreData[][] => {
                if (curr.length == 0) {
                    curr.push([score])
                } else {
                    if (
                        curr[curr.length - 1].length <
                        DistributionService.scoresPerBatch
                    ) {
                        const last = curr.pop()
                        if (last != undefined) {
                            last.push(score)
                            curr.push(last)
                        } else {
                            this.logger.error(
                                'Last element not found, this should not happen',
                            )
                        }
                    } else {
                        curr.push([score])
                    }
                }
                return curr
            },
            [],
        )

        this.logger.debug(
            `Created ${result.length} groups out of ${data.scores.length}`,
        )

        return result
    }

    public async addScores(stamp: number, scores: Score[]): Promise<boolean> {
        if (this.operator != undefined) {
            if (this.isLive === 'true') {
                try {
                    await setTimeout(15000)
                    const response = await this.distributionContract
                        .writeInteraction<AddScores>({
                            function: 'addScores',
                            timestamp: stamp.toString(),
                            scores: scores,
                        })

                    if (response?.originalTxId != undefined) {
                        return true
                    } else {
                        this.logger.error(
                            `Failed storing ${scores.length} scores for ${stamp}`,
                        )
                        return false
                    }
                } catch (error) {
                    this.logger.error(`Exception in addScores`, error.stack)
                    return false
                }
            } else {
                this.logger.warn(
                    `NOT LIVE: Not adding ${scores.length} scores to distribution contract `,
                )
                return false
            }
        } else {
            this.logger.error('Owner is undefined... skipping adding scores ')
            return false
        }
    }

    public async distribute(stamp: number): Promise<boolean> {
        if (!this.operator) {
            this.logger.error(
                `Owner is undefined. Failed to complete distribution of ${stamp}`,
            )

            return false
        }

        if (this.isLive !== 'true') {
            this.logger.warn(`NOT LIVE: Not publishing distribution scores`)

            return false
        }

        try {
            await setTimeout(15000)
            const response = await this.distributionContract
                .writeInteraction<Distribute>({
                    function: 'distribute',
                    timestamp: stamp.toString(),
                })

            if (!response?.originalTxId) {
                this.logger.error(`Failed distribution for ${stamp}`)

                return false
            }

            this.logger.log(`Completed distribution for ${stamp}`)
            
            return true
        } catch (error) {
            this.logger.error('Exception in distribute', error.stack)
            
            return false
        }
    }

    private async refreshDreState(forced: boolean = false) {
        const now = Date.now()
        if (forced || this.dreStateStamp == undefined || now > (this.dreStateStamp + this.dreRefreshDelay)) {
            try {
                const { headers, status, data } = await firstValueFrom(
                    this.httpService
                        .get<DreDistributionResponse>(this.distributionDreUri)
                        .pipe(
                            catchError((error: AxiosError) => {
                                this.logger.error(
                                    `Fetching dre state of distribution from ${this.distributionDreUri} failed with ${error.response?.status}, ${error}`,
                                )
                                throw 'Failed to fetch distribution contract cache from dre'
                            }),
                        ),
                )

                if (status === 200) {
                    this.dreState = data.state
                    this.dreStateStamp = Date.now()
                    this.logger.debug(
                        `Refreshed distribution dre state at ${this.dreStateStamp}`,
                    )
                }
            } catch (e) {
                this.logger.error('Exception when fetching relay registry dre cache', e.stack)
            }
        } else this.logger.debug(`DRE cache warm ${now - this.dreStateStamp}, skipping refresh`)
    }

    private async fetchDistribution(stamp: number): Promise<
        DistributionResult | undefined
    > {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            let result = this.dreState.previousDistributions[stamp]
            let tries = 0
            while (result == undefined && tries < 3) {
                await setTimeout(this.dreRefreshDelay * 2)
                await this.refreshDreState()
                result = this.dreState.previousDistributions[stamp]
                tries++
            }

            return result
        } else {
            const {
                cachedValue: { state: { previousDistributions } }
            } = await this.distributionContract.readState()
            return previousDistributions[stamp]
        }
    }

    public async persistDistribution(stamp: number): Promise<
        Pick<DistributionData, 'summary' | 'summary_tx'>
    > {
        try {
            const summary = await this.fetchDistribution(stamp)

            if (!this.bundlr) {
                this.logger.error(
                    'Bundler not initialized to persist distribution/summary'
                )
    
                return { summary }
            }

            if (this.isLive !== 'true') {
                this.logger.warn(
                    `NOT LIVE: Not storing distribution/summary [${stamp}]`
                )

                return { summary }
            }

            if (!summary) {
                this.logger.warn(
                    `No distribution data found. Skipping storing of distribution/summary [${stamp}]`
                )

                return {}
            }

            const tags = [
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
                { name: 'Entity-Type', value: 'distribution/summary' },
                
                // Base Summary
                {
                    name: 'Time-Elapsed',
                    value: summary.timeElapsed
                },
                {
                    name: 'Base-Distribution-Rate',
                    value: summary.tokensDistributedPerSecond
                },
                {
                    name: 'Base-Network-Score',
                    value: summary.baseNetworkScore
                },
                {
                    name: 'Base-Distributed-Tokens',
                    value: summary.baseDistributedTokens
                },

                // Bonuses Summary
                {
                    name: 'HW-Bonus-Enabled',
                    value: summary.bonuses.hardware.enabled.toString()
                },
                {
                    name: 'HW-Bonus-Distribution-Rate',
                    value: summary.bonuses.hardware.tokensDistributedPerSecond
                },
                {
                    name: 'HW-Bonus-Network-Score',
                    value: summary.bonuses.hardware.networkScore
                },
                {
                    name: 'HW-Bonus-Distributed-Tokens',
                    value: summary.bonuses.hardware.distributedTokens
                },

                // Multipliers Summary
                {
                    name: 'Family-Multiplier-Enabled',
                    value: summary.multipliers.family.enabled.toString()
                },
                {
                    name: 'Family-Multiplier-Rate',
                    value: summary.multipliers.family.familyMultiplierRate
                },

                // Totals Summary
                {
                    name: 'Total-Distribution-Rate',
                    value: summary.totalTokensDistributedPerSecond
                },
                {
                    name: 'Total-Network-Score',
                    value: summary.totalNetworkScore
                },
                {
                    name: 'Total-Distributed',
                    value: summary.totalDistributedTokens
                },
            ]

            const { id: summary_tx } = await this.bundlr.upload(
                JSON.stringify({ [stamp]: summary }),
                { tags }
            )

            this.logger.log(
                `Permanently stored distribution/summary [${stamp}]: ${summary_tx}`
            )

            return { summary, summary_tx }
        } catch (error) {
            this.logger.error(
                'Exception in distribution service persisting summary',
                error.stack
            )
        }

        return {}
    }

    public async getFamilies(): Promise<DistributionState['families']> {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            return this.dreState?.families || {}
        } else {
            const {
                cachedValue: { state }
            } = await this.distributionContract.readState()
            return state.families || {}
        }
    }

    public async getHardwareBonusFingerprints(): Promise<
        DistributionState['bonuses']['hardware']['fingerprints']
    > {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            return this.dreState?.bonuses.hardware.fingerprints || []
        } else {
            const {
                cachedValue: { state }
            } = await this.distributionContract.readState()
            return state.bonuses.hardware.fingerprints || []
        }
    }

    public async setRelayFamilies(
        relays: ValidatedRelay[]
    ): Promise<VerificationResults> {
        const results: VerificationResults = []

        if (!this.distributionContract) {
            this.logger.error('Distribution contract not initialized')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        if (!this.operator) {
            this.logger.error('Distribution operator not defined')

            return relays.map(relay => ({ relay, result: 'Failed' }))
        }

        // NB: Only update relay families that need to be updated
        const currentFamilies = await this.getFamilies()
        const relaysWithFamilyUpdates: ValidatedRelay[] = []
        for (const relay of relays) {
            const incomingFamilyHash = (relay.family || [])
                .slice()
                .sort()
                .join('')
            const contractFamilyHash = (
                currentFamilies[relay.fingerprint] || []
            )
                .slice()
                .sort()
                .join('')
            
            if (incomingFamilyHash !== contractFamilyHash) {
                relaysWithFamilyUpdates.push(relay)
            } else {
                results.push({
                    relay,
                    result: 'AlreadySetFamily'
                })
            }
        }

        let errorCount = 0

        if (this.isLive !== 'true') {
            const firstFingerprint = relaysWithFamilyUpdates.at(0)
            const lastFingerprint = relaysWithFamilyUpdates.at(
                relaysWithFamilyUpdates.length - 1
            )
            this.logger.warn(
                `NOT LIVE - skipped setting relay families for`
                + ` ${relaysWithFamilyUpdates.length} relays`
                + ` [${firstFingerprint} ... ${lastFingerprint}]`
            )
        } else if (relaysWithFamilyUpdates.length > 0) {
            const families = relaysWithFamilyUpdates.map(
                ({ fingerprint, family }) => ({
                    fingerprint,
                    add: _.difference(family, currentFamilies[fingerprint]),
                    remove: _.difference(currentFamilies[fingerprint], family)
                })
            )

            const largeFamilies = _.remove(
                families,
                f =>
                    f.add.length + f.remove.length + 1
                        >= DistributionService.bigFamilyThreshold
            ).map(lf => [ lf ])

            const familyBatches = _.sortBy(
                _.chunk(families, DistributionService.familiesPerBatch),
                // NB: Sort batches to prioritize smaller families first
                [
                    (b) => b.reduce(
                        (sum, f) => sum + f.add.length + f.remove.length,
                        0
                    )
                ]
            )

            familyBatches.push(...largeFamilies)

            for (const familyBatch of familyBatches) {
                await setTimeout(5000)
                this.logger.debug(
                    `Starting to set relay families for ${familyBatch.length}`
                        + ` relays`
                )
                try {
                    const response = await this.distributionContract
                    .writeInteraction<SetFamilies>(
                        {
                            function: 'setFamilies',
                            families: familyBatch.map(({
                                fingerprint, add, remove
                            }) => ({
                                fingerprint,
                                add: add.length > 0
                                    ? add
                                    : undefined,
                                remove: remove.length > 0
                                    ? remove
                                    : undefined
                            }))
                        },
                        { inputFormatAsData: true }
                    )
                    this.logger.log(
                        `Set relay families for ${familyBatch.length}`
                            + ` relays: ${response?.originalTxId}`
                    )
                } catch (error) {
                    errorCount++
                    const failedBatch = familyBatch.map(b => ({
                        fingerprint: b.fingerprint,
                        addSize: b.add.length,
                        removeSize: b.remove.length
                    }))
                    this.logger.error(
                        `Error setting family for batch `
                            + `${JSON.stringify(failedBatch)}`,
                        error.stack
                    )
                }
            }
        } else {
            this.logger.log('No relay families to update')
        }

        if (errorCount > 0) {
            this.logger.error(
                `Error setting families with ${errorCount} failed batches`
            )

            return results.concat(
                relays.map(relay => ({ relay, result: 'Failed' }))
            )
        } else {
            return results.concat(
                relaysWithFamilyUpdates.map(relay => ({ relay, result: 'OK' }))
            )
        }
    }

    public async setHardwareBonusRelays(
        results: VerificationResults
    ): Promise<VerificationResults> {
        const currentHardwareBonusFingerprints =
            await this.getHardwareBonusFingerprints()
        const fingerprints = results
            .filter(
                ({ relay }) => !currentHardwareBonusFingerprints.includes(
                    relay.fingerprint
                )
            )
            .filter(({ relay }) => relay.hardware_validated)
            .map(({ relay }) => relay.fingerprint)

        if (!this.distributionContract) {
            this.logger.error('Distribution contract not initialized')
        }

        if (!this.operator) {
            this.logger.error('Distribution operator not defined')
        }

        if (this.isLive === 'true') {
            try {
                const batches = _.chunk(
                    fingerprints,
                    DistributionService.fingerprintsPerBatch
                )

                for (const batch of batches) {
                    await setTimeout(15000)
                    this.logger.debug(
                        `Starting to set hardware bonus relays for ${batch.length} relays [${batch}]`
                    )
                    const response = await this.distributionContract
                        .writeInteraction<AddFingerprintsToBonus>({
                            function: 'addFingerprintsToBonus',
                            bonusName: 'hardware',
                            fingerprints: batch
                        })
                    this.logger.log(
                        `Set hardware bonus relays for ${batch.length} relays: ${response?.originalTxId}`
                    )
                }
            } catch (error) {
                this.logger.error(
                    `Exception setting relay families for ${fingerprints.length} relays [${fingerprints}]`,
                    error.stack,
                )
            }
        } else {
            this.logger.warn(
                `NOT LIVE - skipped setting hardware bonus relays for ${fingerprints.length} relays [${fingerprints}]`
            )
        }

        return results
    }

    public async setRelayUptimes(
        uptimes: { fingerprint: String, uptime_days: Number, pushed: Boolean }[]
    ): Promise<{ success: boolean }> {
        if (!this.distributionContract) {
            this.logger.error('Distribution contract not initialized')
            return { success: false }
        }

        if (!this.operator) {
            this.logger.error('Distribution operator not defined')
            return { success: false }
        }

        if (this.isLive !== 'true') {
            this.logger.log(`NOT LIVE - skipped setting relay uptimes`)
            return { success: true }
        }

        this.logger.log(
            `Sleeping before writing relay uptimes to distribution contract`
        )
        await setTimeout(15000)
        const fingerprints = uptimes.map(r => r.fingerprint)
        this.logger.log(
            `Setting uptimes for ${uptimes.length} relays [${fingerprints}]`
        )

        try {
            const response = await this.distributionContract
                .writeInteraction<SetQualityTierUptimes>({
                    function: 'setQualityTierUptimes',
                    uptimes: Object.fromEntries(
                        uptimes.map(
                            ({ fingerprint, uptime_days }) =>
                                [ fingerprint, uptime_days ]
                        )
                    )
                })
            this.logger.log(
                `Set uptimes for ${uptimes.length} relays: ${response?.originalTxId}`
            )
        } catch (error) {
            this.logger.error(
                `Exception setting uptimes for ${uptimes.length} relays [${fingerprints}]`,
                error.stack
            )

            return { success: false }
        }

        return { success: true }
    }
}
