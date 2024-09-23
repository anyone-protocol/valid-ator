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
import { DistributionCompletedResults } from 'src/distribution/dto/distribution-completed-result'

@Processor('distribution-queue')
export class DistributionQueue extends WorkerHost {
    private readonly logger = new Logger(DistributionQueue.name)

    public static readonly JOB_START_DISTRIBUTION = 'start-distribution'
    public static readonly JOB_ADD_SCORES = 'add-scores'
    public static readonly JOB_COMPLETE_DISTRIBUTION = 'complete-distribution'
    public static readonly JOB_RETRY_COMPLETE_DISTRIBUTION =
        'retry-complete-distribution'
    public static readonly JOB_PERSIST_DISTRIBUTION = 'persist-distribution'
    public static readonly JOB_RETRY_PERSIST_DISTRIBUTION =
        'retry-persist-distribution'

    constructor(
        private readonly distribution: DistributionService,
        private readonly tasks: TasksService,
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<
        boolean
        | ScoresCompletionData
        | DistributionCompletedResults
        | DistributionData
        | undefined
    > {
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

            case DistributionQueue.JOB_PERSIST_DISTRIBUTION:
                return this.persistDistributionHandler(job)
            
            case DistributionQueue.JOB_RETRY_PERSIST_DISTRIBUTION:
                return this.retryPersistDistributionHandler(job)

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
                const scores = data.relays
                    .map((relay, index, array) => ({
                        ator_address: relay.ator_address,
                        fingerprint: relay.fingerprint,
                        score: relay.consensus_weight,
                    }))
                    .filter((score, index, array) => score.score > 0)

                this.logger.log(
                    `Starting distribution ${data.verified_at} with ${scores.length} non-zero scores of verified relays`,
                )
                const scoreJobs = this.distribution.groupScoreJobs({
                    complete: false,
                    stamp: data.verified_at,
                    scores: scores,
                })

                this.tasks.distributionFlow.add(
                    TasksService.DISTRIBUTION_FLOW({
                        stamp: data.verified_at,
                        total: scores.length,
                        retries: DistributionService.maxDistributionRetries,
                        scoreJobs: scoreJobs,
                        processed: []
                    }),
                )
                return true
            } else {
                this.logger.debug(
                    'Nothing to distribute, data is undefined. Skipping flow',
                )
                return false
            }
        } catch (e) {
            this.logger.error('Exception while starting distribution', e.stack)
            return false
        }
    }

    async persistDistributionHandler(
        job: Job<{ stamp: number, retries: number }, boolean, string>
    ): Promise<DistributionData | undefined> {
        try {
            if (!job.data) {
                this.logger.error(`Missing job data persisting distribution`)

                return undefined
            }

            const distributionCompletedResults = Object.values(
                await job.getChildrenValues<
                    DistributionCompletedResults | undefined
                >()
            ).at(0)

            if (!distributionCompletedResults) {
                this.logger.error(
                    `Missing distribution completed results [${job.data.stamp}]`
                )

                return undefined
            }

            this.logger.log(
                `Persisting distribution summary [${job.data.stamp}]`
            )

            const persistResult = await this.distribution.persistDistribution(
                job.data.stamp
            )

            if (!persistResult && job.data.retries > 0) {
                this.tasks.distributionQueue.add(
                    DistributionQueue.JOB_RETRY_PERSIST_DISTRIBUTION,
                    {
                        stamp: job.data.stamp,
                        distributionCompletedResults,
                        retriesLeft: job.data.retries
                    },
                    TasksService.jobOpts
                )
                this.logger.log(
                    `Failed persisting distribution summary [${job.data.stamp}] - ${persistResult}. Retries left ${job.data.retries}...`
                )
                return undefined
            } else {
                return {
                    ...distributionCompletedResults,
                    ...persistResult
                }
            }
        } catch (err) {
            this.logger.error(
                `Exception persisting distribution summary [${job.data.stamp}]`,
                err.stack
            )
        }

        return undefined
    }

    async retryPersistDistributionHandler(
        job: Job<
            {
                stamp: number,
                retriesLeft: number,
                distributionCompletedResults: DistributionCompletedResults
            },
            any,
            string
        >
    ): Promise<DistributionData | undefined> {
        try {
            if (!job.data) {
                this.logger.error('No job data when retrying persisting distribution summary')

                return undefined
            }

            this.logger.log(
                `Persisting distribution summary [${job.data.stamp}], retries left: ${job.data.retriesLeft}`
            )

            const persistResult = await this.distribution.persistDistribution(
                job.data.stamp
            )

            if (!persistResult && job.data.retriesLeft > 0) {
                this.tasks.distributionQueue.add(
                    DistributionQueue.JOB_RETRY_PERSIST_DISTRIBUTION,
                    {
                        ...job.data,
                        retriesLeft: job.data.retriesLeft - 1
                    },
                    TasksService.jobOpts
                )
                this.logger.log(
                    `Failed persisting distribution summary [${job.data.stamp}] - ${persistResult}. Retries left ${job.data.retriesLeft - 1}...`
                )
                return undefined
            } else {
                return {
                    ...job.data.distributionCompletedResults,
                    ...persistResult
                }
            }
        } catch (err) {
            this.logger.error(
                `Exception persisting distribution summary [${job.data.stamp}]: ${job.data.retriesLeft} retries left`,
                err.stack
            )
        }

        return undefined
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
                this.logger.debug(
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
            this.logger.error('Exception while adding scores', e.stack)
            return { result: false, scores: [] }
        }
    }

    async completeDistributionHandler(
        job: Job<DistributionCompletionData, any, string>,
    ): Promise<DistributionCompletedResults | undefined> {
        try {
            const jobsData: ScoresCompletionData[] = Object.values(
                await job.getChildrenValues(),
            )

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
            this.logger.debug(
                `Distribution stats | processed: ${processedScores.length}, failed: ${failedScores.length}`,
            )

            const data = job.data
            
            if (!data) {
                this.logger.error(
                    'Failed to complete distribution without data'
                )

                return undefined
            }

            if (processedScores.length < data.total) {
                this.logger.warn(
                    `Processed less scores (${processedScores.length}) then the total value set (${data.total})`,
                )
                if (data.retries > 0) {
                    this.startRecoveryDistribution(
                        data,
                        processedScores.concat(data.processed),
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
                this.tasks.distributionFlow.add(
                    TasksService.RETRY_COMPLETE_DISTRIBUTION_FLOW({
                        stamp: data.stamp,
                        retries: data.retries - 1,
                        processed: processedScores.concat(data.processed),
                    })
                )
                this.logger.warn(`Failed to complete distribution ${data.stamp} with ${result}. Retries left ${data.retries - 1}`)
                return undefined
            } else {
                return {
                    complete: result,
                    stamp: data.stamp,
                    scores: processedScores.concat(data.processed).map((score) => ({
                        ator_address: score.address,
                        fingerprint: score.fingerprint,
                        score: Number.parseInt(score.score),
                    })),
                }
            }
        } catch (e) {
            this.logger.error('Exception while completing distribution', e.stack)
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
            TasksService.DISTRIBUTION_FLOW({
                stamp: data.stamp,
                total: failedScores.length,
                retries: data.retries - 1,
                scoreJobs: scoreJobs,
                processed: processedScores
            }),
        )
    }

    private async retryCompleteDistributionHandler(
        job: Job<DistributionCompletionData, any, string>,
    ): Promise<DistributionCompletedResults | undefined> {
        try {
            const data = job.data
            if (data != undefined) {
                this.logger.log(
                    `Completing distribution ${data.stamp}, retries left: ${data.retries}`,
                )
                const result = await this.distribution.distribute(data.stamp)

                if (!result && data.retries > 0) {
                    this.tasks.distributionFlow.add(
                        TasksService.RETRY_COMPLETE_DISTRIBUTION_FLOW({
                            stamp: data.stamp,
                            retries: data.retries - 1,
                            processed: data.processed
                        })
                    )
                    this.logger.warn(`Failed to complete distribution ${data.stamp} with ${result}. Retries left ${data.retries - 1}`)
                    return undefined
                } else {
                    return {
                        complete: result,
                        stamp: data.stamp,
                        scores: data.processed.map((score) => ({
                            ator_address: score.address,
                            fingerprint: score.fingerprint,
                            score: Number.parseInt(score.score),
                        })),
                    }
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
                e.stack,
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
