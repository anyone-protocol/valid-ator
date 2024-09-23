import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ValidationData } from '../validation/schemas/validation-data'
import { ScoreData } from '../distribution/schemas/score-data'
import { ConfigService } from '@nestjs/config'
import { TaskServiceData } from './schemas/task-service-data'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ClusterService } from '../cluster/cluster.service'
import { Score } from 'src/distribution/interfaces/distribution'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    private isLive?: string
    private doClean?: string
    private dataId: Types.ObjectId
    private state: TaskServiceData

    static readonly removeOnComplete = true
    static readonly removeOnFail = 8

    public static jobOpts = {
        removeOnComplete: TasksService.removeOnComplete,
        removeOnFail: TasksService.removeOnFail,
    }

    public static CHECK_BALANCES_FLOW(stamp: number): FlowJob {
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
                {
                    name: 'check-registrator',
                    queueName: 'balance-checks-queue',
                    opts: TasksService.jobOpts,
                },
            ],
        }
    }

    public static VALIDATION_FLOW: FlowJob = {
        name: 'verify', // top-most task marks automatic, task-based transition to the next phase
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

    public static VERIFICATION_FLOW(
        validation: ValidationData,
    ): FlowJob {
        return {
            name: 'distribute', // top-most task marks automatic, task-based transition to the next phase
            queueName: 'tasks-queue',
            opts: TasksService.jobOpts,
            children: [
                {
                    name: 'persist-verification',
                    queueName: 'verification-queue',
                    opts: TasksService.jobOpts,
                    data: validation.validated_at,
                    children: [
                        {
                            name: 'confirm-verification',
                            queueName: 'verification-queue',
                            data: validation.validated_at,
                            opts: TasksService.jobOpts,
                            children: [
                                {
                                    name: 'set-hardware-bonus-relays',
                                    queueName: 'verification-queue',
                                    data: validation.validated_at,
                                    opts: TasksService.jobOpts,
                                    children: [
                                        {
                                            name: 'set-relay-families',
                                            queueName: 'verification-queue',
                                            opts: TasksService.jobOpts,
                                            data: validation.relays,
                                            children: [
                                                {
                                                    name: 'verify-relays',
                                                    queueName: 'verification-queue',
                                                    opts: TasksService.jobOpts,
                                                    data: validation.relays
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        },
                    ],
                }
            ]
        }
    }

    public static DISTRIBUTION_FLOW({
        stamp, total, retries, scoreJobs, processed
    }: {
        stamp: number,
        total: number,
        retries: number,
        scoreJobs: ScoreData[][],
        processed: Score[],
    }): FlowJob {
        return {
            name: 'persist-distribution',
            queueName: 'distribution-queue',
            opts: TasksService.jobOpts,
            data: { stamp, retries: 5 },
            children: [{
                name: 'complete-distribution',
                queueName: 'distribution-queue',
                opts: TasksService.jobOpts,
                data: { stamp, total, retries, processed },
                children: scoreJobs.map((scores, index, array) => ({
                    name: 'add-scores',
                    queueName: 'distribution-queue',
                    opts: TasksService.jobOpts,
                    data: { stamp, scores }
                }))
            }]
        }
    }

    public static RETRY_COMPLETE_DISTRIBUTION_FLOW({
        stamp, retries, processed
    }: {
        stamp: number,
        retries: number,
        processed: Score[],
    }): FlowJob {
        return {
            name: 'persist-distribution',
            queueName: 'distribution-queue',
            opts: TasksService.jobOpts,
            data: { stamp, retries: 5 },
            children: [{
                name: 'retry-complete-distribution',
                queueName: 'distribution-queue',
                opts: TasksService.jobOpts,
                data: { stamp, retries, processed, total: processed.length }
            }]
        }
    }

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
            DO_CLEAN: boolean
        }>,
        private readonly cluster: ClusterService,
        @InjectQueue('tasks-queue') public tasksQueue: Queue,
        @InjectQueue('validation-queue') public validationQueue: Queue,
        @InjectFlowProducer('validation-flow')
        public validationFlow: FlowProducer,
        @InjectQueue('verification-queue') public verificationQueue: Queue,
        @InjectFlowProducer('verification-flow')
        public verificationFlow: FlowProducer,
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
        this.doClean = this.config.get<string>('DO_CLEAN', { infer: true })
        this.state = {
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
        if (this.cluster.isTheOne()) {
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
                `Bootstrapped Tasks Service [id: ${this.dataId}, isValidating: ${this.state.isValidating}, isCheckingBalances: ${this.state.isCheckingBalances}]`,
            )

            if (this.doClean != 'true') {
                this.logger.log('Skipped cleaning up old jobs')
            } else {
                this.logger.log('Cleaning up old (24hrs+) jobs')
                await this.tasksQueue.clean(24 * 60 * 60 * 1000, -1)
                await this.validationQueue.clean(24 * 60 * 60 * 1000, -1)
                await this.verificationQueue.clean(24 * 60 * 60 * 1000, -1)
                await this.distributionQueue.clean(24 * 60 * 60 * 1000, -1)
            }

            if (this.isLive != 'true') {
                this.logger.debug('Cleaning up queues for dev...')
                await this.tasksQueue.obliterate({ force: true })
                await this.validationQueue.obliterate({ force: true })
                await this.verificationQueue.obliterate({ force: true })
                await this.distributionQueue.obliterate({ force: true })

                await this.queueValidateRelays(0)
                this.logger.log('Queued immediate validation of relays')
                await this.queueCheckBalances(0)
                this.logger.log('Queued immediate balance checks')
            } else {

                if (this.state.isValidating) {
                    this.logger.log('The validation of relays should already be queued')
                } else {
                    await this.queueValidateRelays(0)
                    this.logger.log('Queued immediate validation of relays')
                }

                if (this.state.isCheckingBalances) {
                    this.logger.log('The checking of balances should already be queued')
                } else {
                    await this.queueCheckBalances(0)
                    this.logger.log('Queued immediate balance checks')
                }
            }

        } else {
            this.logger.debug(
                'Not the one, skipping bootstrap of tasks service',
            )
        }
    }

    public async queueCheckBalances(
        delayJob: number = 1000 * 60 * 60,
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

    public async queueValidateRelays(
        delayJob: number = 1000 * 60 * 60
    ): Promise<void> {
        if (!this.state.isValidating) {
            this.state.isValidating = true
            await this.updateServiceState()
        }

        await this.tasksQueue.add(
            'validate',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.removeOnComplete,
                removeOnFail: TasksService.removeOnFail,
            },
        )
    }
}
