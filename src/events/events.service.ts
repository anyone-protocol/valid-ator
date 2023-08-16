import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { RewardAllocationData } from 'src/distribution/dto/reward-allocation-data';
import { TasksService } from 'src/tasks/tasks.service';

@Injectable()
export class EventsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventsService.name)

    private isLive? : string

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
        private readonly tasks: TasksService,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
        this.facilitatorAddress = this.config.get<string>('FACILITY_CONTRACT_ADDRESS', { infer: true })
        this.jsonRpc = this.config.get<string>('JSON_RPC', { infer: true })
        this.facilityOperatorKey = this.config.get<string>('FACILITY_OPERATOR_KEY', { infer: true })
    }

    async onApplicationBootstrap(): Promise<void> {
        if (this.facilitatorAddress != undefined) {            
            this.subscribeToFacilitator()
                .catch((error) => console.error('Failed subscribing to facilitator events:', error))
        } else {
            this.logger.warn('Missing FACILITY_CONTRACT_ADDRESS, not subscribing to Facilitator evm events')
            
        }    
    }

    public async updateAllocation(data: RewardAllocationData): Promise<void> {
        if (this.signerContract == undefined) {
            this.logger.error('Facility signer contract not initialized, skipping allocation update')
        } else {
            await this.signerContract.updateAllocation(data.address, ethers.parseUnits(data.amount, 0), true)
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
                        await this.tasks.tasksQueue.add('request-facility-update', accountString, TasksService.jobOpts) 
                    })
                }
            }
        }
    }
}
