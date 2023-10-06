import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { DistributionService } from 'src/distribution/distribution.service'
import { TasksService } from '../tasks.service'
import { DistributionData } from 'src/distribution/schemas/distribution-data'
import { ScoreData } from 'src/distribution/schemas/score-data'
import { Score } from 'src/distribution/interfaces/distribution'
import { VerificationData } from 'src/verification/schemas/verification-data'

@Processor('distribution-queue')
export class DistributionQueue extends WorkerHost {
    private readonly logger = new Logger(DistributionQueue.name)

    public static readonly JOB_START_DISTRIBUTION = 'start-distribution'
    public static readonly JOB_ADD_SCORES = 'add-scores'
    public static readonly JOB_COMPLETE_DISTRIBUTION = 'complete-distribution'

    constructor(
        private readonly distribution: DistributionService,
        private readonly tasks: TasksService,
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<boolean | DistributionData | Score[] | undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case DistributionQueue.JOB_START_DISTRIBUTION:
                const data: VerificationData = job.data as VerificationData
                if (data != undefined) {
                    this.logger.log(
                        `Starting distribution ${data.verified_at} with ${data.relays.length} relays`,
                    )
                    try {
                        const scoreJobs = this.distribution.groupScoreJobs({
                            complete: false,
                            stamp: data.verified_at,
                            scores: data.relays.map((relay, index, array) => ({
                                ator_address: relay.ator_address,
                                fingerprint: relay.fingerprint,
                                score: relay.consensus_weight,
                            })),
                        })

                        this.logger.log(
                            `Created ${scoreJobs.length} groups out of ${data.relays.length}`,
                        )
                        this.tasks.distributionFlow.add(
                            TasksService.DISTRIBUTE_RELAY_SCORES(
                                data.verified_at,
                                scoreJobs,
                            ),
                        )
                        return true
                    } catch (e) {
                        this.logger.error(e)
                        return false
                    }
                } else {
                    this.logger.debug(
                        'Nothing to distribute, data is undefined. Skipping flow',
                    )
                    return false
                }

            case DistributionQueue.JOB_ADD_SCORES:
                try {
                    const data = job.data as {
                        stamp: number
                        scores: ScoreData[]
                    }
                    if (data != undefined) {
                        this.logger.log(
                            `Adding ${data.scores.length} scores for ${data.stamp}`,
                        )

                        const result = await this.distribution.addScores(
                            data.stamp,
                            data.scores.map((data) => ({
                                fingerprint: data.fingerprint,
                                address: data.ator_address,
                                score: data.score.toString(),
                            })),
                        )
                        return result
                    } else {
                        this.logger.error('Missing scores in job data')
                        return []
                    }
                } catch (e) {
                    this.logger.error(e)
                    return []
                }

            case DistributionQueue.JOB_COMPLETE_DISTRIBUTION:
                try {
                    const processedScores: Score[] = Object.values(
                        await job.getChildrenValues(),
                    ).reduce(
                        (prev, curr) => (prev as []).concat(curr as []),
                        [],
                    )
                    const stamp = job.data as number
                    if (stamp != undefined) {
                        this.logger.log(`Completing distribution ${stamp}`)
                        const result = await this.distribution.distribute(stamp)

                        return {
                            complete: result,
                            stamp: stamp,
                            scores: processedScores.map((score) => ({
                                ator_address: score.address,
                                fingerprint: score.fingerprint,
                                score: Number.parseInt(score.score),
                            })),
                        }
                    } else {
                        this.logger.error(
                            'Failed to complete distribution without a timestamp',
                        )
                        return undefined
                    }
                } catch (e) {
                    this.logger.error(e)
                    return undefined
                }

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
