import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ValidationData } from 'src/onionoo/schemas/validation-data'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    private static readonly keepCompleted: 128
    private static readonly keepFailed: 1024

    public static jobOpts = {
        removeOnComplete: TasksService.keepCompleted,
        removeOnFail: TasksService.keepFailed,
    }

    public static VALIDATE_ONIONOO_RELAYS_FLOW: FlowJob = {
        name: 'publish-validation',
        queueName: 'tasks-queue',
        opts: TasksService.jobOpts,
        children: [
            {
                name: 'validate-relays',
                queueName: 'onionoo-queue',
                opts: TasksService.jobOpts,
                children: [
                    {
                        name: 'filter-relays',
                        queueName: 'onionoo-queue',
                        opts: TasksService.jobOpts,
                        children: [
                            {
                                name: 'fetch-relays',
                                queueName: 'onionoo-queue',
                                opts: TasksService.jobOpts,
                            },
                        ],
                    },
                ],
            },
        ],
    }

    public static PUBLISH_RELAY_VALIDATIONS(
        validation: ValidationData,
    ): FlowJob {
        return {
            name: 'finalize-publish',
            queueName: 'publishing-queue',
            data: validation.validated_at,
            opts: TasksService.jobOpts,
            children: validation.relays.map((relay, index, array) => ({
                name: 'publish-validated-relay',
                queueName: 'publishing-queue',
                opts: TasksService.jobOpts,
                data: relay,
            })),
        }
    }

    constructor(
        @InjectQueue('tasks-queue') public tasksQueue: Queue,
        @InjectQueue('onionoo-queue') public onionooQueue: Queue,
        @InjectQueue('publishing-queue') public publishingQueue: Queue,
        @InjectFlowProducer('validation-flow')
        public validationFlow: FlowProducer,
        @InjectFlowProducer('publishing-flow')
        public publishingFlow: FlowProducer,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Bootstrapping Tasks Service')
        await this.tasksQueue.obliterate({ force: true })
        await this.onionooQueue.obliterate({ force: true })
        await this.publishingQueue.obliterate({ force: true })
        await this.updateOnionooRelays(0)
    }

    public async updateOnionooRelays(
        delayJob: number = 1000 * 60,
    ): Promise<void> {
        await this.tasksQueue.add(
            'validate-onionoo-relays',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.keepCompleted,
                removeOnFail: TasksService.keepFailed,
            },
        )
    }
}
