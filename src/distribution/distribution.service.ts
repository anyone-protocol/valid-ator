import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom, catchError } from 'rxjs'
import { DistributionData } from './schemas/distribution-data'
import { ScoreData } from './schemas/score-data'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import {
    AddScores,
    DistributionResult,
    DistributionState,
    Score,
} from 'src/distribution/interfaces/distribution'
import { ConfigService } from '@nestjs/config'
import { Wallet, ethers } from 'ethers'
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
import { DistributionCompletedResults } from './dto/distribution-completed-result'
import { setTimeout } from 'node:timers/promises'
import { AxiosError } from 'axios'
import { DreDistributionResponse } from './interfaces/dre-relay-registry-response'
import { HttpService } from '@nestjs/axios'

@Injectable()
export class DistributionService {
    private readonly logger = new Logger(DistributionService.name)

    private isLive?: string
    private operator

    private static readonly scoresPerBatch = 8
    public static readonly maxDistributionRetries = 6

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

            const signer = new EthereumSigner(distributionOperatorKey)

            this.operator = {
                address: signer.address,
                signer: signer,
            }

            this.logger.log(
                `Initialized distribution service for address: ${this.operator.address}`,
            )

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
                    .connect(this.operator.signer)
            } else this.logger.error('Missing distribution contract txid')
        } else this.logger.error('Missing contract owner key...')
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
                    await setTimeout(5000)
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
            await setTimeout(5000)
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

    private async fetchDistribution(stamp: number): Promise<DistributionResult | undefined> {
        await this.refreshDreState()
        if (this.dreState != undefined) {
            var result = this.dreState.previousDistributions[stamp]
            var tries = 0
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

            if (summary == undefined) {
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
                { name: 'Total-Score', value: summary.totalNetworkScore },
                {
                    name: 'Total-Distributed',
                    value: summary.totalDistributedTokens
                },
                { name: 'Time-Elapsed', value: summary.timeElapsed },
                {
                    name: 'Distribution-Rate',
                    value: summary.tokensDistributedPerSecond
                }
            ]

            if (summary.bonuses && summary.bonuses.hardware) {
                tags.push({ name: 'Bonus-Tokens', value: summary.bonuses.hardware.distributedTokens })
            }

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
}
