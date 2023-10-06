import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ConfigService } from '@nestjs/config';
import BigNumber from 'bignumber.js';
import { ethers, AddressLike } from 'ethers';
import { RewardAllocationData } from 'src/distribution/dto/reward-allocation-data';

@Injectable()
export class EventsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventsService.name)

    private isLive? : string

    private static readonly removeOnComplete: true
    private static readonly removeOnFail: 8

    public static jobOpts = {
        removeOnComplete: EventsService.removeOnComplete,
        removeOnFail: EventsService.removeOnFail,
    }

    private facilitatorABI = [
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "_account",
              "type": "address"
            }
          ],
          "name": "RequestingUpdate",
          "type": "event"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "addr",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "allocated",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "doClaim",
              "type": "bool"
            }
          ],
          "name": "updateAllocation",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
      ]

    private facilitatorAddress: string | undefined
    private facilityOperatorKey: string | undefined
    private jsonRpc: string | undefined
    private operator: ethers.Wallet
    private contract: ethers.Contract
    private signerContract: any
    private provider: ethers.JsonRpcProvider

    constructor(
        private readonly config: ConfigService<{
            FACILITY_CONTRACT_ADDRESS: string
            FACILITY_OPERATOR_KEY: string
            JSON_RPC: string
            IS_LIVE: string
        }>,
        @InjectQueue('facilitator-updates-queue') public facilitatorUpdatesQueue: Queue,
        @InjectFlowProducer('facilitator-updates-flow')
        public facilitatorUpdatesFlow: FlowProducer
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })

        this.facilitatorAddress = this.config.get<string>('FACILITY_CONTRACT_ADDRESS', { infer: true })
        this.jsonRpc = this.config.get<string>('JSON_RPC', { infer: true })
        this.facilityOperatorKey = this.config.get<string>('FACILITY_OPERATOR_KEY', { infer: true })
        
        this.logger.log(
            `Initializing events service (IS_LIVE: ${this.isLive}, FACILITATOR: ${this.facilitatorAddress})`,
        )
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.facilitatorUpdatesQueue.obliterate({ force: true })
        if (this.facilitatorAddress != undefined) {            
            this.subscribeToFacilitator()
                .catch((error) => console.error('Failed subscribing to facilitator events:', error))
        } else {
            this.logger.warn('Missing FACILITY_CONTRACT_ADDRESS, not subscribing to Facilitator evm events')
            
        }    
    }

    public async updateAllocation(data: RewardAllocationData): Promise<void> {
        if (this.isLive === 'true') {
            if (this.signerContract == undefined) {
                this.logger.error('Facility signer contract not initialized, skipping allocation update')
            } else {
                await this.signerContract.updateAllocation(data.address, BigNumber(data.amount).toFixed(0), true)
            }
        } else {
            this.logger.warn(
                `NOT LIVE: Not storing updating allocation of ${data.address} to ${BigNumber(data.amount).toFixed(0).toString()} relay(s) `,
            )
        }
    }

    private async subscribeToFacilitator() {  
        if (this.jsonRpc == undefined) {
            this.logger.error('Missing JSON_RPC. Skipping facilitator subscription')
        } else {
            this.provider = new ethers.JsonRpcProvider(this.jsonRpc)
            if (this.facilityOperatorKey == undefined) {
                this.logger.error('Missing FACILITY_OPERATOR_KEY. Skipping facilitator subscription')
            } else {
                this.operator = new ethers.Wallet(
                    this.facilityOperatorKey, this.provider
                )
                if (this.facilitatorAddress == undefined) {
                    this.logger.error('Missing FACILITY_CONTRACT_ADDRESS. Skipping facilitator subscription')
                } else {
                    this.logger.log(`Subscribing to the Facilitator contract (${this.facilitatorAddress}) with ${this.operator.address}...`)

                    this.contract = new ethers.Contract(this.facilitatorAddress, this.facilitatorABI, this.provider)
                    this.signerContract = this.contract.connect(this.operator)
                    this.contract.on('RequestingUpdate', async (_account: ethers.AddressLike) => {
                        let accountString: string
                        if (_account instanceof Promise) {
                            accountString = await _account
                        } else if (ethers.isAddressable(_account)) {
                            accountString = await _account.getAddress()
                        } else {
                            accountString = _account
                        }
                        
                        if (accountString != undefined) {
                            this.logger.log(`Starting rewards update for ${accountString}`)
                            await this.facilitatorUpdatesFlow.add(
                                {
                                    name: 'update-allocation',
                                    queueName: 'facilitator-updates-queue',
                                    opts: EventsService.jobOpts,
                                    children: [{
                                        name: 'get-current-rewards',
                                        queueName: 'facilitator-updates-queue',
                                        opts: EventsService.jobOpts,
                                        data: accountString
                                    }],
                                }
                            )
                        } else {
                            this.logger.error('Trying to request facility update but missing address in data')
                        }
                    })
                }
            }
        }
    }
}
