import { Injectable, Logger } from '@nestjs/common'
import { DistributionData } from './schemas/distribution-data'
import { ScoreData } from './schemas/score-data'
import { Contract, LoggerFactory, Warp, WarpFactory } from 'warp-contracts'
import {
    AddScores,
    DistributionState,
    Score,
} from 'src/distribution/interfaces/distribution'
import { ConfigService } from '@nestjs/config'
import { Wallet, ethers } from 'ethers'
import { EthersExtension } from 'warp-contracts-plugin-ethers'
import {
    buildEvmSignature,
    EvmSignatureVerificationServerPlugin,
    // @ts-ignore
} from 'warp-contracts-plugin-signature/server'
import { StateUpdatePlugin } from 'warp-contracts-subscription-plugin'
import Bundlr from '@bundlr-network/client'
import { Distribute } from './interfaces/distribution'
import { RewardAllocationData } from './dto/reward-allocation-data'
import { Claimable } from 'src/verification/interfaces/relay-registry'
import { DistributionCompletedResults } from './dto/distribution-completed-result'

@Injectable()
export class DistributionService {
    private readonly logger = new Logger(DistributionService.name)

    private isLive?: string
    private operator

    private static readonly scoresPerBatch = 8
    public static readonly maxDistributionRetries = 6

    private distributionWarp: Warp
    private distributionContract: Contract<DistributionState>

    private bundlr

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
            DISTRIBUTION_CONTRACT_TXID: string
            DISTRIBUTION_OPERATOR_KEY: string
            DRE_HOSTNAME: string
            BUNDLR_NODE: string
            BUNDLR_NETWORK: string
        }>,
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
                const node = config.get<string>('BUNDLR_NODE', {
                    infer: true,
                })
                const network = config.get<string>('BUNDLR_NETWORK', {
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

            const signer = new Wallet(distributionOperatorKey)

            this.operator = {
                address: signer.address,
                key: distributionOperatorKey,
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
                    .use(new EvmSignatureVerificationServerPlugin())
                this.distributionWarp.use(
                    new StateUpdatePlugin(
                        distributionContractTxId,
                        this.distributionWarp,
                    ),
                )

                const dreHostname = this.config.get<string>('DRE_HOSTNAME', {
                    infer: true,
                })

                this.distributionContract = this.distributionWarp
                    .contract<DistributionState>(distributionContractTxId)
                    .setEvaluationOptions({
                        remoteStateSyncEnabled: true,
                        remoteStateSyncSource: dreHostname ?? 'dre-1.warp.cc',
                    })
            } else this.logger.error('Missing distribution contract txid')
        } else this.logger.error('Missing contract owner key...')
    }

    public async getAllocation(
        address: string,
    ): Promise<RewardAllocationData | undefined> {
        if (this.operator != undefined) {
            const evmSig = await buildEvmSignature(this.operator.signer)
            try {
                const response = await this.distributionContract
                    .connect({
                        signer: evmSig,
                        type: 'ethereum',
                    })
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
                const evmSig = await buildEvmSignature(this.operator.signer)
                try {
                    const response = await this.distributionContract
                        .connect({
                            signer: evmSig,
                            type: 'ethereum',
                        })
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

        const evmSig = await buildEvmSignature(this.operator.signer)
        try {
            const response = await this.distributionContract
                .connect({
                    signer: evmSig,
                    type: 'ethereum',
                })
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

    public async persistDistribution(stamp: number): Promise<
        Pick<DistributionData, 'summary' | 'summary_tx'>
    > {
        try {
            const {
                cachedValue: { state: { previousDistributions } }
            } = await this.distributionContract.readState()
            const summary = previousDistributions[stamp]

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
                { name: 'Total-Score', value: summary.totalScore },
                {
                    name: 'Total-Distributed',
                    value: summary.totalDistributed
                },
                { name: 'Time-Elapsed', value: summary.timeElapsed },
                {
                    name: 'Distribution-Rate',
                    value: summary.tokensDistributedPerSecond
                }
            ]

            if (summary.bonusTokens) {
                tags.push({ name: 'Bonus-Tokens', value: summary.bonusTokens })
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
