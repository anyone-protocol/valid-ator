import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { DistributionService } from 'src/distribution/distribution.service'
import { TasksService } from '../tasks.service'
import { DistributionData } from 'src/distribution/schemas/distribution-data'
import { ScoreData } from 'src/distribution/schemas/score-data'
import { Score } from 'src/distribution/interfaces/distribution'
import { VerificationData } from 'src/verification/schemas/verification-data'
import { DistributionCompletionData } from 'src/distribution/dto/distribution-completion-data'
import { ScoresCompletionData } from 'src/distribution/dto/scores-completion-data'

@Processor('distribution-queue')
export class DistributionQueue extends WorkerHost {
    private readonly logger = new Logger(DistributionQueue.name)

    public static readonly JOB_START_DISTRIBUTION = 'start-distribution'
    public static readonly JOB_ADD_SCORES = 'add-scores'
    public static readonly JOB_COMPLETE_DISTRIBUTION = 'complete-distribution'
    public static readonly JOB_RETRY_COMPLETE_DISTRIBUTION =
        'retry-complete-distribution'

    constructor(
        private readonly distribution: DistributionService,
        private readonly tasks: TasksService,
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<boolean | ScoresCompletionData | DistributionData | undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case DistributionQueue.JOB_START_DISTRIBUTION:
                return this.startDistributionHandler(job)

            case DistributionQueue.JOB_ADD_SCORES:
                return this.addScoresHandler(job)

            case DistributionQueue.JOB_COMPLETE_DISTRIBUTION:
                return this.completeDistributionHandler(job)

            case DistributionQueue.JOB_RETRY_COMPLETE_DISTRIBUTION:
                return this.retryCompleteDistributionHandler(job)

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }

    startDistributionHandler(job: Job<any, any, string>): boolean {
        try {
            const data: VerificationData = job.data as VerificationData
            if (data != undefined) {
                this.logger.log(
                    `Starting distribution ${data.verified_at} with ${data.relays.length} relays`,
                )
                const scoreJobs = this.distribution.groupScoreJobs({
                    complete: false,
                    stamp: data.verified_at,
                    scores: data.relays.map((relay, index, array) => ({
                        ator_address: relay.ator_address,
                        fingerprint: relay.fingerprint,
                        score: relay.consensus_weight,
                    })),
                })

                this.tasks.distributionFlow.add(
                    TasksService.DISTRIBUTE_RELAY_SCORES(
                        data.verified_at,
                        data.relays.length,
                        DistributionService.maxDistributionRetries,
                        scoreJobs,
                    ),
                )
                return true
            } else {
                this.logger.debug(
                    'Nothing to distribute, data is undefined. Skipping flow',
                )
                return false
            }
        } catch (e) {
            this.logger.error('Exception while starting distribution', e)
            return false
        }
    }

    async addScoresHandler(
        job: Job<any, any, string>,
    ): Promise<ScoresCompletionData> {
        try {
            const data = job.data as {
                stamp: number
                scores: ScoreData[]
            }
            if (data != undefined) {
                this.logger.log(
                    `Adding ${data.scores.length} scores for ${data.stamp}`,
                )
                const scores: Score[] = this.dataToScores(data.scores)

                const result = await this.distribution.addScores(
                    data.stamp,
                    scores,
                )

                return { result: result, scores: scores }
            } else {
                this.logger.error('Missing scores in job data')
                return { result: false, scores: [] }
            }
        } catch (e) {
            this.logger.error('Exception while adding scores', e)
            return { result: false, scores: [] }
        }
    }

    async completeDistributionHandler(
        job: Job<any, any, string>,
    ): Promise<DistributionData | undefined> {
        try {
            const jobsData: ScoresCompletionData[] = Object.values(
                await job.getChildrenValues(),
            )
            this.logger.log(`Jobs data ${jobsData.length}`)
            if (jobsData.length > 0) {
                this.logger.log(`Job detail ${jobsData[0]}`)
            }

            const { processedScores, failedScores } = jobsData.reduce(
                (acc, curr) => {
                    if (curr.result) {
                        acc.processedScores.push(...curr.scores)
                    } else {
                        acc.failedScores.push(...curr.scores)
                    }
                    return acc
                },
                { processedScores: [] as Score[], failedScores: [] as Score[] },
            )
            this.logger.log(`Distribution stats | processed: ${processedScores.length}, failed: ${failedScores.length}`)

            const data: DistributionCompletionData = job.data as DistributionCompletionData
            if (data != undefined) {
                if (processedScores.length < data.total) {
                    this.logger.warn(`Processed less scores (${processedScores.length}) then the total value set (${data.total})`)
                    if (data.retries > 0) {
                        this.startRecoveryDistribution(
                            data,
                            processedScores,
                            failedScores,
                        )
                        return undefined
                    } else {
                        this.logger.error(
                            `Failed adding ${
                                data.total - processedScores.length
                            }/${failedScores.length} scores to distribution ${
                                data.stamp
                            }. No more retries left. Completing distribution with fallback on gradual calculations in contract.`,
                        )
                    }
                }

                this.logger.log(`Completing distribution ${data.stamp}`)
                const result = await this.distribution.distribute(data.stamp)

                if (!result && data.retries > 0) {
                    this.tasks.distributionQueue.add(
                        DistributionQueue.JOB_RETRY_COMPLETE_DISTRIBUTION,
                        {
                            stamp: data.stamp,
                            total: data.total,
                            retries: data.retries - 1,
                        },
                        TasksService.jobOpts,
                    )
                }

                return {
                    complete: result,
                    stamp: data.stamp,
                    scores: processedScores.map((score) => ({
                        ator_address: score.address,
                        fingerprint: score.fingerprint,
                        score: Number.parseInt(score.score),
                    })),
                }
            } else {
                this.logger.error(
                    'Failed to complete distribution without data',
                )
                return undefined
            }
        } catch (e) {
            this.logger.error('Exception while completing distribution', e)
            return undefined
        }
    }

    private startRecoveryDistribution(
        data: DistributionCompletionData,
        processedScores: Score[],
        failedScores: Score[],
    ) {
        this.logger.warn(
            `Failed adding ${data.total - processedScores.length}/${
                failedScores.length
            } scores to distribution ${data.stamp}. Attempting to recover (${
                data.retries
            } retries left) before completing distribution...`,
        )

        const scoresData: ScoreData[] = this.scoresToData(failedScores)

        const scoreJobs = this.distribution.groupScoreJobs({
            complete: false,
            stamp: data.stamp,
            scores: scoresData,
        })

        this.tasks.distributionFlow.add(
            TasksService.DISTRIBUTE_RELAY_SCORES(
                data.stamp,
                failedScores.length,
                data.retries - 1,
                scoreJobs,
            ),
        )
    }

    private async retryCompleteDistributionHandler(
        job: Job<any, any, string>,
    ): Promise<DistributionData | undefined> {
        try {
            const data = job.data as DistributionCompletionData
            if (data != undefined) {
                this.logger.log(
                    `Completing distribution ${data.stamp}, retries left: ${data.retries}`,
                )
                const result = await this.distribution.distribute(data.stamp)

                if (!result && data.retries > 0) {
                    this.tasks.distributionQueue.add(
                        DistributionQueue.JOB_RETRY_COMPLETE_DISTRIBUTION,
                        {
                            stamp: data.stamp,
                            total: data.total,
                            retries: data.retries - 1,
                        },
                        TasksService.jobOpts,
                    )
                }

                return {
                    complete: result,
                    stamp: data.stamp,
                    scores: [],
                }
            } else {
                this.logger.error(
                    'Failed to retry completion of distribution without data',
                )
                return undefined
            }
        } catch (e) {
            this.logger.error(
                'Exception while retrying the completing of distribution',
                e,
            )
            return undefined
        }
    }

    private scoresToData(scores: Score[]): ScoreData[] {
        return scores.map((data) => ({
            fingerprint: data.fingerprint,
            ator_address: data.address,
            score: Number.parseInt(data.score),
        }))
    }

    private dataToScores(data: ScoreData[]): Score[] {
        return data.map((data) => ({
            fingerprint: data.fingerprint,
            address: data.ator_address,
            score: data.score.toString(),
        }))
    }
}
