import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TasksService } from '../tasks.service'

@Processor('publishing-queue')
export class PublishingQueue extends WorkerHost {
    private readonly logger = new Logger(PublishingQueue.name)

    constructor(private readonly tasks: TasksService) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case 'publish-smartweave':
                this.logger.log(`Publishing smartweave ${job.data}`)

                return true

            case 'finalize-publish':
                this.logger.log(
                    `Finished processing publishing jobs for validation ${job.data}`,
                )

                break

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
