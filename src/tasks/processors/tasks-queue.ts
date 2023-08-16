import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TasksService } from '../tasks.service'
import { ValidationData } from 'src/validation/schemas/validation-data'
import { VerificationData } from 'src/verification/schemas/verification-data'
import { VerificationService } from 'src/verification/verification.service'

@Processor('tasks-queue')
export class TasksQueue extends WorkerHost {
    private readonly logger = new Logger(TasksQueue.name)

    public static readonly JOB_VALIDATE_ONIONOO_RELAYS =
        'validate-onionoo-relays'
    public static readonly JOB_PUBLISH_VALIDATION = 'publish-validation'
    public static readonly JOB_RUN_DISTRIBUTION = 'run-distribution'
    public static readonly JOB_REQUEST_FACILITY_UPDATE = 'request-facility-update'

    constructor(
        private readonly tasks: TasksService,
        private readonly verification: VerificationService
    ) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case TasksQueue.JOB_VALIDATE_ONIONOO_RELAYS:
                this.tasks.validationFlow.add(
                    TasksService.VALIDATE_ONIONOO_RELAYS_FLOW,
                )

                await this.tasks.updateOnionooRelays() // using default delay time in param
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

            case TasksQueue.JOB_RUN_DISTRIBUTION:

                const verificationData: VerificationData | null = await this.verification.getMostRecent()

                if (verificationData != null) {
                    const distribution_time = Date.now()
                    const currentData = Object.assign(verificationData, { verified_at: distribution_time })
                    this.logger.log(`Running distribution ${currentData.verified_at} with ${currentData.relays.length}`)
                    this.tasks.distributionQueue.add(
                        'start-distribution', 
                        currentData,
                        TasksService.jobOpts 
                    )
                    this.tasks.queueDistributing() // using default delay time in param
                } else {
                    this.logger.warn(
                        'Nothing to distribute, this should not happen, or just wait for the first distribution to happen',
                    )
                }
                
                break

            case TasksQueue.JOB_REQUEST_FACILITY_UPDATE:
                const address = job.data as string
                if (address != undefined) {
                    this.logger.log(`Starting rewards update for ${address}`)
                    await this.tasks.requestFacilityUpdate(address)
                } else {
                    this.logger.error('Trying to request facility update but missing address in job data')
                }
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
