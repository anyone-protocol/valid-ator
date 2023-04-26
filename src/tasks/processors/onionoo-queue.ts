import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { OnionooService } from 'src/onionoo/onionoo.service'
import { TasksService } from '../tasks.service'
import { RelayInfo } from 'src/onionoo/interfaces/8_3/relay-info'
import { RelayDataDto } from 'src/onionoo/dto/relay-data-dto'

@Processor('onionoo-queue')
export class OnionooQueue extends WorkerHost {
    private readonly logger = new Logger(OnionooQueue.name)

    constructor(
        private readonly onionoo: OnionooService,
        private readonly tasks: TasksService,
    ) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case 'update-onionoo-relays-fetch':
                const relays = await this.onionoo.fetchNewRelays()
                return relays

            case 'update-onionoo-relays-validate':
                const fetchedRelays: RelayInfo[] = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

                const validated = await this.onionoo.filterRelays(fetchedRelays)

                return validated

            case 'update-onionoo-relays-persist':
                const validatedRelays: RelayDataDto[] = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

                await this.onionoo.validateRelays(validatedRelays)
                this.tasks.requestUpdateOnionooRelays()
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
