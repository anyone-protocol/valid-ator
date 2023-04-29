import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TasksService } from '../tasks.service'
import { ValidationData } from 'src/onionoo/schemas/validation-data'

@Processor('tasks-queue')
export class TasksQueue extends WorkerHost {
    private readonly logger = new Logger(TasksQueue.name)

    public static readonly JOB_VALIDATE_ONIONOO_RELAYS =
        'validate-onionoo-relays'
    public static readonly JOB_PUBLISH_VALIDATION = 'publish-validation'

    constructor(private readonly tasks: TasksService) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case TasksQueue.JOB_VALIDATE_ONIONOO_RELAYS:
                this.tasks.validationFlow.add(
                    TasksService.VALIDATE_ONIONOO_RELAYS_FLOW,
                )
                break

            case TasksQueue.JOB_PUBLISH_VALIDATION:
                const validationData: ValidationData[] = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

                if (validationData.length > 0)
                    this.tasks.publishingFlow.add(
                        TasksService.PUBLISH_RELAY_VALIDATIONS(
                            validationData[0],
                        ),
                    )
                else
                    this.logger.warn(
                        'Nothing to publish, this should not happen',
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
