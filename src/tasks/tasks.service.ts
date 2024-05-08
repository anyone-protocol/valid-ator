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

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TasksService.name)

    private isLive?: string
    private dataId: Types.ObjectId
    private state: TaskServiceData

    private static readonly removeOnComplete = true
    private static readonly removeOnFail = 8

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
        name: 'verify',
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
                        children: [{
                            name: 'set-relay-family',
                            queueName: 'verification-queue',
                            opts: TasksService.jobOpts,
                            data: relay
                        }]
                    })),
                },
            ],
        }
    }

    public static DISTRIBUTION_FLOW(
        stamp: number,
        total: number,
        retries: number,
        scoreJobs: ScoreData[][],
    ): FlowJob {
        return {
            name: 'persist-distribution',
            queueName: 'distribution-queue',
            opts: TasksService.jobOpts,
            data: { stamp, retries },
            children: [{
                name: 'complete-distribution',
                queueName: 'distribution-queue',
                opts: TasksService.jobOpts,
                data: { stamp, total, retries },
                children: scoreJobs.map((scores, index, array) => ({
                    name: 'add-scores',
                    queueName: 'distribution-queue',
                    opts: TasksService.jobOpts,
                    data: { stamp, scores }
                }))
            }]
        }
    }

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
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

        if (this.isLive != 'true' && this.cluster.isTheOne()) {
            await this.tasksQueue.obliterate({ force: true })

            await this.validationQueue.obliterate({ force: true })
            await this.verificationQueue.obliterate({ force: true })
            await this.distributionQueue.obliterate({ force: true })
        }

        if (!this.state.isValidating) {
            if (this.cluster.isTheOne()) {
                await this.updateOnionooRelays(0) // do an early update post reboot and time it from there
            } else {
                this.logger.debug(
                    'Not the one, skipping start of onionoo updates... Should start in another process',
                )
            }
        } else {
            this.logger.log('The validation of relays should already be queued')
        }

        if (!this.state.isDistributing) {
            if (this.cluster.isTheOne()) {
                await this.queueDistributing(0)
            } else {
                this.logger.debug(
                    'Not the one, skipping start of distribution... Should start in another process',
                )
            }
        } else {
            this.logger.log(
                'The distribution of tokens should already be queued',
            )
        }

        if (!this.state.isCheckingBalances) {
            if (this.cluster.isTheOne()) {
                await this.queueCheckBalances(0)
            } else {
                this.logger.debug(
                    'Not the one, skipping start of balance checks... Should start in another process',
                )
            }
        } else {
            this.logger.log('The checking of balances should already be queued')
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

    public async queueDistributing(
        delayJob: number = 1000 * 60 * 60,
    ): Promise<void> {
        if (!this.state.isDistributing) {
            this.state.isDistributing = true
            await this.updateServiceState()
        }

        await this.tasksQueue.add(
            'distribute',
            {},
            {
                delay: delayJob,
                removeOnComplete: TasksService.removeOnComplete,
                removeOnFail: TasksService.removeOnFail,
            },
        )
    }

    public async updateOnionooRelays(
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
