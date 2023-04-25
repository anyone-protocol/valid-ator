import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    public static UPDATE_ONIONOO_RELAYS_FLOW: FlowJob = {
        name: 'update-onionoo-relays-persist',
        queueName: 'onionoo-queue',
        opts: { removeOnComplete: 128, removeOnFail: 1024 },
        children: [
            {
                name: 'update-onionoo-relays-validate',
                queueName: 'onionoo-queue',
                opts: { removeOnComplete: 128, removeOnFail: 1024 },
                children: [
                    {
                        name: 'update-onionoo-relays-fetch',
                        queueName: 'onionoo-queue',
                        opts: { removeOnComplete: 128, removeOnFail: 1024 },
                    },
                ],
            },
        ],
    }

    constructor(
        @InjectQueue('tasks-queue') public tasksQueue: Queue,
        @InjectQueue('onionoo-queue') public onionooQueue: Queue,
        @InjectFlowProducer('tasks-flow') public flow: FlowProducer,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Bootstrapping Tasks Service')
        await this.tasksQueue.obliterate({ force: true })
        await this.onionooQueue.obliterate({ force: true })
        await this.requestUpdateOnionooRelays(0)
    }

    public async requestUpdateOnionooRelays(
        delayJob: number = 1000 * 10,
    ): Promise<void> {
        await this.tasksQueue.add(
            'update-onionoo-relays',
            {},
            { delay: delayJob, removeOnComplete: 128, removeOnFail: 1024 },
        )
    }
}
