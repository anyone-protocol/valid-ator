import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ValidationData } from 'src/validation/schemas/validation-data'
import { ScoreData } from 'src/distribution/schemas/score-data'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    private isLive?: string

    private static readonly removeOnComplete: true
    private static readonly removeOnFail: 8

    public static jobOpts = {
        removeOnComplete: TasksService.removeOnComplete,
        removeOnFail: TasksService.removeOnFail,
    }

    public static VALIDATE_ONIONOO_RELAYS_FLOW: FlowJob = {
        name: 'publish-validation',
        queueName: 'tasks-queue',
        opts: TasksService.jobOpts,
        children: [
            {
                name: 'validate-relays',
                queueName: 'validation-queue',
                opts: TasksService.jobOpts,
                children: [
                    {
                        name: 'filter-relays',
                        queueName: 'validation-queue',
                        opts: TasksService.jobOpts,
                        children: [
                            {
                                name: 'fetch-relays',
                                queueName: 'validation-queue',
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
            name: 'persist-verification',
            queueName: 'verification-queue',
            opts: TasksService.jobOpts,
            children: [
                {
                    name: 'confirm-verification',
                    queueName: 'verification-queue',
                    data: validation.validated_at,
                    opts: TasksService.jobOpts,
                    children: validation.relays.map((relay, index, array) => ({
                        name: 'verify-relay',
                        queueName: 'verification-queue',
                        opts: TasksService.jobOpts,
                        data: relay,
                    })),
                },
            ],
        }
    }

    public static DISTRIBUTE_RELAY_SCORES(
        stamp: number,
        total: number,
        retries: number,
        scoreJobs: ScoreData[][],
    ): FlowJob {
        return {
            name: 'complete-distribution',
            queueName: 'distribution-queue',
            opts: TasksService.jobOpts,
            data: {
                stamp: stamp,
                total: total,
                retries: retries,
            },
            children: scoreJobs.map((scores, index, array) => ({
                name: 'add-scores',
                queueName: 'distribution-queue',
                opts: TasksService.jobOpts,
                data: {
                    stamp: stamp,
                    scores: scores,
                },
            })),
        }
    }

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
        }>,
        @InjectQueue('tasks-queue') public tasksQueue: Queue,
        @InjectQueue('validation-queue') public validationQueue: Queue,
        @InjectQueue('verification-queue') public verificationQueue: Queue,
        @InjectQueue('distribution-queue') public distributionQueue: Queue,
        @InjectFlowProducer('validation-flow')
        public validationFlow: FlowProducer,
        @InjectFlowProducer('verification-flow')
        public publishingFlow: FlowProducer,
        @InjectFlowProducer('distribution-flow')
        public distributionFlow: FlowProducer,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
    }

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Bootstrapping Tasks Service')
        await this.tasksQueue.obliterate({ force: true })

        if (this.isLive != 'true') {
            await this.validationQueue.obliterate({ force: true })
            await this.verificationQueue.obliterate({ force: true })
            await this.distributionQueue.obliterate({ force: true })
        }

        // TODO: make sure there is onionoo updates queued or in progress and create one if there isnt
        await this.updateOnionooRelays(0) // Onionoo has its own rhythm so we'll hit cache and do nothing if too soon

        // TODO: make sure there is distribution queued or in progress and create one if there isnt
        const delayToRhythmDistribution = 0
        await this.queueDistributing(0)
    }

    public async queueDistributing(
        delayJob: number = 1000 * 60 * 60,
    ): Promise<void> {
        await this.tasksQueue.add(
            'run-distribution',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.removeOnComplete,
                removeOnFail: TasksService.removeOnFail,
            },
        )
    }

    public async updateOnionooRelays(
        delayJob: number = 1000 * 60 * 10,
    ): Promise<void> {
        await this.tasksQueue.add(
            'validate-onionoo-relays',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.removeOnComplete,
                removeOnFail: TasksService.removeOnFail,
            },
        )
    }
}
