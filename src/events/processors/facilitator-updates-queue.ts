import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { DistributionService } from 'src/distribution/distribution.service'
import { RewardAllocationData } from 'src/distribution/dto/reward-allocation-data'
import { EventsService } from 'src/events/events.service'

@Processor('facilitator-updates-queue')
export class FacilitatorUpdatesQueue extends WorkerHost {
    private readonly logger = new Logger(FacilitatorUpdatesQueue.name)

    public static readonly JOB_GET_CURRENT_REWARDS = 'get-current-rewards'
    public static readonly JOB_UPDATE_ALLOCATION = 'update-allocation'

    constructor(
        private readonly distribution: DistributionService,
        private readonly events: EventsService
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<RewardAllocationData | boolean | undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case FacilitatorUpdatesQueue.JOB_GET_CURRENT_REWARDS:
                const address = job.data as string
                if (address != undefined) {
                    this.logger.log(`Fetching current rewards from distribution for ${address}`)
                    try {
                        return await this.distribution.getAllocation(address)
                    } catch (e) {
                        this.logger.error(e)
                        return undefined
                    }
                } else {
                    this.logger.error('Missing address in job data')
                    return undefined
                }

            case FacilitatorUpdatesQueue.JOB_UPDATE_ALLOCATION:
                const data: RewardAllocationData[] = Object.values(
                    await job.getChildrenValues(),
                ).reduce(
                    (prev, curr) => (prev as []).concat(curr as []),
                    [],
                )

                if (data.length > 0) {
                    this.logger.log(`Updating rewards for ${data[0].address}`)
                    try {
                        const isPassed = await this.events.updateAllocation(data[0])
                        return true
                    } catch (e) {
                        this.logger.error(e)
                        return false
                    }
                } else {
                    this.logger.error('Missing address in job data')
                    return false
                }

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
                return undefined
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
