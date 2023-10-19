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
import { Distribute } from './interfaces/distribution'
import { RewardAllocationData } from './dto/reward-allocation-data'
import { Claimable } from 'src/verification/interfaces/relay-registry'

@Injectable()
export class DistributionService {
    private readonly logger = new Logger(DistributionService.name)

    private isLive?: string
    private operator

    private static readonly scoresPerBatch = 8
    public static readonly maxDistributionRetries = 6

    private distributionWarp: Warp
    private distributionContract: Contract<DistributionState>

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
            DISTRIBUTION_CONTRACT_TXID: string
            DISTRIBUTION_OPERATOR_KEY: string
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

                this.distributionContract =
                    this.distributionWarp.contract<DistributionState>(
                        distributionContractTxId,
                    )
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
                this.logger.error(`Exception in getAllocation:`, error)
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
        const result = data.scores
            .reduce<ScoreData[][]>(
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
                    this.logger.error(`Exception in addScores`, error)
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
        if (this.operator != undefined) {
            if (this.isLive === 'true') {
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

                    if (response?.originalTxId != undefined) {
                        this.logger.log(`Completed distribution for ${stamp}`)
                        return true
                    } else {
                        this.logger.error(`Failed distribution for ${stamp}`)
                        return false
                    }
                } catch (error) {
                    this.logger.error('Exception in distribute', error)
                    return false
                }
            } else {
                this.logger.warn(`NOT LIVE: Not publishing distribution scores`)
                return false
            }
        } else {
            this.logger.error(
                `Owner is undefined. Failed to complete distribution of ${stamp}`,
            )
            return false
        }
    }
}
