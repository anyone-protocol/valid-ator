import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ethers } from 'ethers'

@Injectable()
export class UserBalancesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserBalancesService.name)

  private jsonRpc?: string
  private provider: ethers.JsonRpcProvider
  private relayUpNftContractAddress?: string

  constructor(
    private readonly config: ConfigService<{
      JSON_RPC: string,
      RELAY_UP_NFT_CONTRACT_ADDRESS: string
    }>
  ) {
    this.relayUpNftContractAddress = this.config.get<string>(
      'RELAY_UP_NFT_CONTRACT_ADDRESS', { infer: true }
    )

    this.jsonRpc = this.config.get<string>('JSON_RPC', { infer: true })

    if (!this.jsonRpc) {
      this.logger.error('Missing JSON_RPC!')
    } else {
      this.provider = new ethers.JsonRpcProvider(this.jsonRpc)

      this.logger.log(
        `Initialized user balance checks for RELAYUP NFT Contract: ${this.relayUpNftContractAddress}`
      )
    }
  }

  async onApplicationBootstrap() {
    this.logger.log(`Bootstrapped User Balances Service`)
  }
}
