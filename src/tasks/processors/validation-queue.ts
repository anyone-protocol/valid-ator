import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ValidationService } from 'src/validation/validation.service'
import { TasksService } from '../tasks.service'
import { RelayInfo } from 'src/validation/interfaces/8_3/relay-info'
import { RelayDataDto } from 'src/validation/dto/relay-data-dto'
import { ValidationData } from 'src/validation/schemas/validation-data'

@Processor('validation-queue')
export class ValidationQueue extends WorkerHost {
    private readonly logger = new Logger(ValidationQueue.name)

    public static readonly JOB_FETCH_RELAYS = 'fetch-relays'
    public static readonly JOB_FILTER_RELAYS = 'filter-relays'
    public static readonly JOB_VALIDATE_RELAYS = 'validate-relays'

    constructor(
        private readonly onionoo: ValidationService,
        private readonly tasks: TasksService,
    ) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<RelayInfo[] | RelayDataDto[] | ValidationData | undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case ValidationQueue.JOB_FETCH_RELAYS:
                try {
                    const relays = await this.onionoo.fetchNewRelays()
                    return relays
                } catch (e) {
                    this.logger.error(e)
                    return []
                }

            case ValidationQueue.JOB_FILTER_RELAYS:
                try {
                    const fetchedRelays: RelayInfo[] = Object.values(
                        await job.getChildrenValues(),
                    ).reduce(
                        (prev, curr) => (prev as []).concat(curr as []),
                        [],
                    )

                    const validated = await this.onionoo.filterRelays(
                        fetchedRelays,
                    )

                    return validated
                } catch (e) {
                    this.logger.error(e)
                    return []
                }

            case ValidationQueue.JOB_VALIDATE_RELAYS:
                try {
                    const validatedRelays: RelayDataDto[] = Object.values(
                        await job.getChildrenValues(),
                    ).reduce(
                        (prev, curr) => (prev as []).concat(curr as []),
                        [],
                    )

                    const validationData = await this.onionoo.validateRelays(
                        validatedRelays,
                    )
                    await this.tasks.updateOnionooRelays() // using default delay time in param
                    return validationData
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
