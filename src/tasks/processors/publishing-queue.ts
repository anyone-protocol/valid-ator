import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TasksService } from '../tasks.service'
import { ContractsService } from 'src/contracts/contracts.service'

@Processor('publishing-queue')
export class PublishingQueue extends WorkerHost {
    private readonly logger = new Logger(PublishingQueue.name)

    public static readonly JOB_PUBLISH_VALIDATED_RELAY =
        'publish-validated-relay'
    public static readonly JOB_FINALIZE_PUBLISH = 'finalize-publish'

    constructor(
        private readonly tasks: TasksService,
        private readonly contracts: ContractsService,
    ) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case PublishingQueue.JOB_PUBLISH_VALIDATED_RELAY:
                if (job.data)
                    this.logger.log(`Publishing relay ${job.data.fingerprint}`)

                if (
                    job.data.fingerprint !== undefined &&
                    typeof job.data.fingerprint === 'string' &&
                    job.data.length() === 40
                ) {
                    if (
                        (await this.contracts.isRegisteredRelay(
                            job.data.fingerprint,
                        )) === false
                    )
                        await this.contracts.registerRelay(job.data)
                    else
                        this.logger.debug(
                            `Relay [${job.data.fingerprint}] already registered`,
                        )
                } else
                    this.logger.log(
                        `Incorrect fingerprint [${job.data.fingerprint}] `,
                    )

                return true

            case PublishingQueue.JOB_FINALIZE_PUBLISH:
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
