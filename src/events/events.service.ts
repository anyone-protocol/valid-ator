import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import BigNumber from 'bignumber.js'
import { ethers, AddressLike, EventPayload, EventLog } from 'ethers'
import { RecoverUpdateAllocationData } from './dto/recover-update-allocation-data'
import { RewardAllocationData } from '../distribution/dto/reward-allocation-data'
import { ClusterService } from '../cluster/cluster.service'

import { facilitatorABI } from './abi/facilitator'
import { registratorABI } from './abi/registrator'

@Injectable()
export class EventsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventsService.name)

    private isLive?: string

    private static readonly maxUpdateAllocationRetries = 6

    private static readonly removeOnComplete = true
    private static readonly removeOnFail = 8

    public static jobOpts = {
        removeOnComplete: EventsService.removeOnComplete,
        removeOnFail: EventsService.removeOnFail,
    }

    private jsonRpc: string | undefined
    private infuraApiKey: string | undefined
    private infuraApiSecret: string | undefined
    private infuraNetwork: string | undefined
    private infuraWsUrl: string | undefined

    private facilitatorAddress: string | undefined
    private facilityOperatorKey: string | undefined
    private facilitatorOperator: ethers.Wallet
    private facilitatorContract: ethers.Contract
    private facilitySignerContract: any

    private registratorAddress: string | undefined
    private registratorOperatorKey: string | undefined
    private registratorOperator: ethers.Wallet
    private registratorContract: ethers.Contract
    private registratorSignerContract: any

    private provider: ethers.WebSocketProvider

    constructor(
        private readonly config: ConfigService<{
            FACILITY_CONTRACT_ADDRESS: string
            FACILITY_OPERATOR_KEY: string
            REGISTRATOR_CONTRACT_ADDRESS: string
            REGISTRATOR_OPERATOR_KEY: string
            JSON_RPC: string
            IS_LIVE: string
            INFURA_NETWORK: string
            INFURA_WS_URL: string
        }>,
        private readonly cluster: ClusterService,
        @InjectQueue('facilitator-updates-queue')
        public facilitatorUpdatesQueue: Queue,
        @InjectFlowProducer('facilitator-updates-flow')
        public facilitatorUpdatesFlow: FlowProducer,
        @InjectQueue('registrator-updates-queue')
        public registratorUpdatesQueue: Queue,
        @InjectFlowProducer('registrator-updates-flow')
        public registratorUpdatesFlow: FlowProducer,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
        this.jsonRpc = this.config.get<string>('JSON_RPC', { infer: true })
        this.infuraNetwork = this.config.get<string>('INFURA_NETWORK', { infer: true })
        this.infuraWsUrl = this.config.get<string>('INFURA_WS_URL', { infer: true })

        this.facilitatorAddress = this.config.get<string>(
            'FACILITY_CONTRACT_ADDRESS',
            { infer: true },
        )
        this.facilityOperatorKey = this.config.get<string>(
            'FACILITY_OPERATOR_KEY',
            { infer: true },
        )

        this.registratorAddress = this.config.get<string>(
            'REGISTRATOR_CONTRACT_ADDRESS',
            { infer: true },
        )
        this.registratorOperatorKey = this.config.get<string>(
            'REGISTRATOR_OPERATOR_KEY',
            { infer: true },
        )

        this.provider = new ethers.WebSocketProvider(this.infuraWsUrl!, this.infuraNetwork)

        this.logger.log(
            `Initializing events service (IS_LIVE: ${this.isLive}, FACILITATOR: ${this.facilitatorAddress})`,
        )
    }

    async onApplicationBootstrap(): Promise<void> {
        if (this.cluster.isTheOne()) {
            if (this.isLive != 'true') {
                await this.facilitatorUpdatesQueue.obliterate({ force: true })
                await this.registratorUpdatesQueue.obliterate({ force: true })
            }
            
            if (this.facilitatorAddress != undefined) {
                this.subscribeToFacilitator().catch((error) =>
                    this.logger.error(
                        'Failed subscribing to facilitator events:',
                        error,
                    ),
                )
            } else {
                this.logger.warn(
                    'Missing FACILITY_CONTRACT_ADDRESS, not subscribing to Facilitator EVM events',
                )
            }

            if (this.registratorAddress != undefined) {
                this.subscribeToRegistrator().catch((error) =>
                    this.logger.error(
                        'Failed subscribing to registrator events:',
                        error,
                    ),
                )
            } else {
                this.logger.warn(
                    'Missing REGISTRATOR_CONTRACT_ADDRESS, not subscribing to Registrator EVM events',
                )
            }
        } else {
            this.logger.debug('Not the one, so skipping event subscriptions')
        }
    }

    public async recoverUpdateAllocation(rewardData: RewardAllocationData) {
        const recoverData: RecoverUpdateAllocationData = {
            ...rewardData,
            retries: EventsService.maxUpdateAllocationRetries,
        }
        this.logger.log(
            `Attempting to recover updateAllocation job with ${recoverData.retries} retries for ${recoverData.address}`,
        )
        this.facilitatorUpdatesQueue.add(
            'recover-update-allocation',
            recoverData,
            EventsService.jobOpts,
        )
    }

    public async retryUpdateAllocation(
        recoverData: RecoverUpdateAllocationData,
    ) {
        const retryData: RecoverUpdateAllocationData = {
            ...recoverData,
            retries: recoverData.retries - 1,
        }
        this.logger.log(
            `Retry updateAllocation job with ${recoverData.retries} retries for ${recoverData.address}`,
        )
        this.facilitatorUpdatesQueue.add(
            'recover-update-allocation',
            retryData,
            EventsService.jobOpts,
        )
    }

    public async trackFailedUpdateAllocation(
        recoverData: RecoverUpdateAllocationData,
    ) {
        this.logger.error(
            `Failed recovering the update of allocation for ${recoverData.address} with amount ${recoverData.amount}`,
        )
    }

    private checkIfPassableReason(reason: string): boolean {
        switch (reason) {
            case 'Facility: no tokens allocated for sender':
                return true
            case 'Facility: no tokens available to claim':
                return true
            default:
                return false
        }
    }

    private checkForInternalWarnings(reason: string): boolean {
        switch (reason) {
            case 'Facility: not enough tokens to claim':
                return true
            case 'Facility: transfer of claimable tokens failed':
                return true
            default:
                return false
        }
    }

    public async updateAllocation(
        data: RewardAllocationData,
    ): Promise<boolean> {
        if (this.isLive === 'true') {
            if (this.facilitySignerContract == undefined) {
                this.logger.error(
                    'Facility signer contract not initialized, skipping allocation update',
                )
            } else {
                try {
                    await this.facilitySignerContract.updateAllocation(
                        data.address,
                        BigNumber(data.amount).toFixed(0),
                        true,
                    )
                    return true
                } catch (updateError) {
                    if (updateError.reason) {
                        const isWarning = this.checkForInternalWarnings(
                            updateError.reason,
                        )
                        if (isWarning) {
                            this.logger.error(
                                `UpdateAllocation needs manual intervention: ${updateError.reason}`,
                            )
                            return false
                        }

                        const isPassable = this.checkIfPassableReason(
                            updateError.reason,
                        )
                        if (isPassable) {
                            this.logger.warn(
                                `UpdateAllocation tx rejected: ${updateError.reason}`,
                            )
                        } else {
                            this.logger.error(
                                `UpdateAllocation transaction failed: ${updateError.reason}`,
                            )
                        }
                        return isPassable
                    } else {
                        this.logger.error(
                            `Error while calling updateAllocation for ${data.address}:`,
                            updateError.stack,
                        )
                    }
                }
            }
            return false
        } else {
            this.logger.warn(
                `NOT LIVE: Not storing updating allocation of ${
                    data.address
                } to ${BigNumber(data.amount).toFixed(0).toString()} relay(s) `,
            )

            return true
        }
    }

    private async subscribeToFacilitator() {
        if (this.jsonRpc == undefined) {
            this.logger.error(
                'Missing JSON_RPC. Skipping facilitator subscription',
            )
        } else {
            if (this.facilityOperatorKey == undefined) {
                this.logger.error(
                    'Missing FACILITY_OPERATOR_KEY. Skipping facilitator subscription',
                )
            } else {
                this.facilitatorOperator = new ethers.Wallet(
                    this.facilityOperatorKey,
                    this.provider,
                )
                if (this.facilitatorAddress == undefined) {
                    this.logger.error(
                        'Missing FACILITY_CONTRACT_ADDRESS. Skipping facilitator subscription',
                    )
                } else {
                    this.logger.log(
                        `Subscribing to the Facilitator contract ${this.facilitatorAddress} with ${this.facilitatorOperator.address}...`,
                    )

                    this.facilitatorContract = new ethers.Contract(
                        this.facilitatorAddress,
                        facilitatorABI,
                        this.provider,
                    )
                    this.facilitySignerContract = this.facilitatorContract.connect(this.facilitatorOperator)
                    this.facilitatorContract.on(
                        'RequestingUpdate',
                        async (_account: AddressLike) => {
                            if (this.cluster.isTheOne()) {
                                let accountString: string
                                if (_account instanceof Promise) {
                                    accountString = await _account
                                } else if (ethers.isAddressable(_account)) {
                                    accountString = await _account.getAddress()
                                } else {
                                    accountString = _account
                                }

                                if (accountString != undefined) {
                                    this.logger.log(
                                        `Starting rewards update for ${accountString}`,
                                    )
                                    await this.facilitatorUpdatesFlow.add({
                                        name: 'update-allocation',
                                        queueName: 'facilitator-updates-queue',
                                        opts: EventsService.jobOpts,
                                        children: [
                                            {
                                                name: 'get-current-rewards',
                                                queueName:
                                                    'facilitator-updates-queue',
                                                opts: EventsService.jobOpts,
                                                data: accountString,
                                            },
                                        ],
                                    })
                                } else {
                                    this.logger.error(
                                        'Trying to request facility update but missing address in data',
                                    )
                                }
                            } else {
                                this.logger.debug(
                                    'Not the one, skipping starting rewards update... should be started somewhere else',
                                )
                            }
                        },
                    )
                }
            }
        }
    }

    private async subscribeToRegistrator() {
        if (this.jsonRpc == undefined) {
            this.logger.error(
                'Missing JSON_RPC. Skipping registrator subscription',
            )
        } else {
            try {
                if (this.registratorOperatorKey == undefined) {
                    this.logger.error(
                        'Missing REGISTRATOR_OPERATOR_KEY. Skipping registrator subscription',
                    )
                } else {
                    this.registratorOperator = new ethers.Wallet(
                        this.registratorOperatorKey,
                        this.provider,
                    )
                    if (this.registratorAddress == undefined) {
                        this.logger.error(
                            'Missing REGISTRATOR_CONTRACT_ADDRESS. Skipping registrator subscription',
                        )
                    } else {
                        this.logger.log(
                            `Subscribing to the Registrator contract ${this.registratorAddress} with ${this.registratorOperator.address}...`,
                        )

                        this.registratorContract = new ethers.Contract(
                            this.registratorAddress,
                            registratorABI,
                            this.provider,
                        )
                        this.registratorSignerContract = this.registratorContract.connect(this.registratorOperator)
                        this.registratorContract.on(
                            'Registered',
                            async (_account: AddressLike, _fingerprint: string | Promise<string>, event: EventLog) => {
                                if (this.cluster.isTheOne()) {
                                    let accountString: string
                                    if (_account instanceof Promise) {
                                        accountString = await _account
                                    } else if (ethers.isAddressable(_account)) {
                                        accountString = await _account.getAddress()
                                    } else {
                                        accountString = _account
                                    }

                                    let fingerprintString: string
                                    if (_fingerprint instanceof Promise) {
                                        fingerprintString = await _fingerprint
                                    } else {
                                        fingerprintString = _fingerprint
                                    }

                                    if (accountString != undefined) {
                                        this.logger.log(
                                            `Noticed registration lock for ${accountString} with fingerprint: ${fingerprintString}`,
                                        )
                                        await this.registratorUpdatesFlow.add({
                                            name: 'add-registration-credit',
                                            queueName: 'registrator-updates-queue',
                                            data: {
                                                address: accountString,
                                                fingerprint: fingerprintString,
                                                tx: event.transactionHash
                                            },
                                            opts: EventsService.jobOpts,
                                            children: [
                                                // add checks to do before passing registration...
                                            ],
                                        })
                                    } else {
                                        this.logger.error(
                                            'Trying to request facility update but missing address in data',
                                        )
                                    }
                                } else {
                                    this.logger.debug(
                                        'Not the one, skipping starting rewards update... should be started somewhere else',
                                    )
                                }
                            },
                        )
                    }
                }
            } catch(error) {
                this.logger.error(`Caught error while subscribing to registrator events:`, error.stack)
            }
        }
    }
}
