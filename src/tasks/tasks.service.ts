import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ValidationData } from 'src/validation/schemas/validation-data'
import { ScoreData } from 'src/distribution/schemas/score-data'
import { AddressLike } from 'ethers'

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
            // name: 'run-distribution',
            // queueName: 'tasks-queue',
            // opts: TasksService.jobOpts,
            // children: [{
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
            // }]
        }
    }

    public static DISTRIBUTE_RELAY_SCORES(
        stamp: number,
        scoreJobs: ScoreData[][],
    ): FlowJob {
        return {
            name: 'complete-distribution',
            queueName: 'distribution-queue',
            opts: TasksService.jobOpts,
            data: stamp,
            children: scoreJobs.map((scores, index, array) => ({
                name: 'add-scores',
                queueName: 'distribution-queue',
                opts: TasksService.jobOpts,
                data: {
                    stamp: stamp,
                    scores: scores
                },
            })),
        }
    }

    constructor(
        @InjectQueue('tasks-queue') public tasksQueue: Queue,
        @InjectQueue('validation-queue') public validationQueue: Queue,
        @InjectQueue('verification-queue') public verificationQueue: Queue,
        @InjectQueue('distribution-queue') public distributionQueue: Queue,
        @InjectQueue('facilitator-updates-queue') public facilitatorUpdatesQueue: Queue,
        @InjectFlowProducer('validation-flow')
        public validationFlow: FlowProducer,
        @InjectFlowProducer('verification-flow')
        public publishingFlow: FlowProducer,
        @InjectFlowProducer('distribution-flow')
        public distributionFlow: FlowProducer,
        @InjectFlowProducer('facilitator-updates-flow')
        public facilitatorUpdatesFlow: FlowProducer
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Bootstrapping Tasks Service')
        await this.tasksQueue.obliterate({ force: true })

        // TODO: some of these queues should persist beyond app reboot in live
        await this.validationQueue.obliterate({ force: true })
        await this.verificationQueue.obliterate({ force: true })
        await this.distributionQueue.obliterate({ force: true })
        await this.facilitatorUpdatesQueue.obliterate({ force: true })

        await this.updateOnionooRelays(0)
        await this.queueDistributing(0)
    }

    public async requestFacilityUpdate(address: string): Promise<void> {
        await this.facilitatorUpdatesFlow.add(
            {
                name: 'update-allocation',
                queueName: 'facilitator-updates-queue',
                opts: TasksService.jobOpts,
                children: [{
                    name: 'get-current-rewards',
                    queueName: 'facilitator-updates-queue',
                    opts: TasksService.jobOpts,
                    data: address
                }],
            }
        )
    }

    public async queueDistributing(
        delayJob: number = 1000 * 60 * 60,
    ): Promise<void> {
        await this.tasksQueue.add(
            'run-distribution',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.keepCompleted,
                removeOnFail: TasksService.keepFailed,
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
                removeOnComplete: TasksService.keepCompleted,
                removeOnFail: TasksService.keepFailed,
            },
        )
    }
}
