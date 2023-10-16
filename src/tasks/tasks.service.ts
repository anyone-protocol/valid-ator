import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ValidationData } from 'src/validation/schemas/validation-data'
import { ScoreData } from 'src/distribution/schemas/score-data'
import { ConfigService } from '@nestjs/config'
import { TaskServiceData } from './schemas/task-service-data'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    private isLive?: string
    private dataId: Types.ObjectId
    private state: TaskServiceData

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

    public static CHECK_BALANCES(stamp: number): FlowJob {
        return {
            name: 'publish-balance-checks',
            queueName: 'balance-checks-queue',
            data: stamp,
            opts: TasksService.jobOpts,
            children: [
                {
                    name: 'check-facility-operator',
                    queueName: 'balance-checks-queue',
                    opts: TasksService.jobOpts,
                },
                {
                    name: 'check-distribution-operator',
                    queueName: 'balance-checks-queue',
                    opts: TasksService.jobOpts,
                },
                {
                    name: 'check-relay-registry-operator',
                    queueName: 'balance-checks-queue',
                    opts: TasksService.jobOpts,
                },
            ],
        }
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
        @InjectFlowProducer('validation-flow')
        public validationFlow: FlowProducer,
        @InjectQueue('verification-queue') public verificationQueue: Queue,
        @InjectFlowProducer('verification-flow')
        public publishingFlow: FlowProducer,
        @InjectQueue('distribution-queue') public distributionQueue: Queue,
        @InjectFlowProducer('distribution-flow')
        public distributionFlow: FlowProducer,
        @InjectQueue('balance-checks-queue') public balancesQueue: Queue,
        @InjectFlowProducer('balance-checks-flow')
        public balancesFlow: FlowProducer,
        @InjectModel(TaskServiceData.name)
        private readonly taskServiceDataModel: Model<TaskServiceData>,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
        this.state = {
            isDistributing: false,
            isValidating: false,
            isCheckingBalances: false,
        }
    }

    private async createServiceState(): Promise<void> {
        const newData = await this.taskServiceDataModel.create(this.state)
        this.dataId = newData._id
    }

    private async updateServiceState(): Promise<void> {
        const updateResult = await this.taskServiceDataModel.updateOne(
            { _id: this.dataId },
            this.state,
        )
        if (!updateResult.acknowledged) {
            this.logger.error(
                'Failed to acknowledge update of the task service state',
            )
        }
    }

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Bootstrapping Tasks Service')
        const hasData = await this.taskServiceDataModel.exists({})

        if (hasData) {
            const serviceData = await this.taskServiceDataModel
                .findOne({})
                .exec()
                .catch((error) => {
                    this.logger.error(error)
                })

            if (serviceData != null) {
                this.dataId = serviceData._id
                this.state = {
                    isValidating: serviceData.isValidating,
                    isDistributing: serviceData.isDistributing,
                    isCheckingBalances: serviceData.isCheckingBalances,
                }
            } else {
                this.logger.warn(
                    'This should not happen. Data was deleted, or is incorrect',
                )
                this.createServiceState()
            }
        } else this.createServiceState()

        this.logger.log(
            `Bootstrapped Tasks Service [id: ${this.dataId}, isValidating: ${this.state.isValidating}, isDistributing: ${this.state.isDistributing}]`,
        )

        if (this.isLive != 'true') {
            await this.tasksQueue.obliterate({ force: true })

            await this.validationQueue.obliterate({ force: true })
            await this.verificationQueue.obliterate({ force: true })
            await this.distributionQueue.obliterate({ force: true })
        }

        if (!this.state.isValidating) {
            await this.updateOnionooRelays(0) // Onionoo has its own rhythm so we'll hit cache and do nothing if too soon
        } else {
            this.logger.log('The validation of relays should already be queued')
        }

        if (!this.state.isDistributing) {
            await this.queueDistributing(0)
        } else {
            this.logger.log(
                'The distribution of tokens should already be queued',
            )
        }

        if (!this.state.isCheckingBalances) {
            await this.queueCheckBalances(0)
        } else {
            this.logger.log('The checking of balances should already be queued')
        }
    }

    public async queueCheckBalances(
        delayJob: number = 1000 * 60 * 60 * 24,
    ): Promise<void> {
        if (!this.state.isCheckingBalances) {
            this.state.isCheckingBalances = true
            await this.updateServiceState()
        }

        await this.tasksQueue.add(
            'check-balances',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.removeOnComplete,
                removeOnFail: TasksService.removeOnFail,
            },
        )
    }

    public async queueDistributing(
        delayJob: number = 1000 * 60 * 60,
    ): Promise<void> {
        if (!this.state.isDistributing) {
            this.state.isDistributing = true
            await this.updateServiceState()
        }

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
        if (!this.state.isValidating) {
            this.state.isValidating = true
            await this.updateServiceState()
        }

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
