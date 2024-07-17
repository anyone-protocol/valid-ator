import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Contract, ethers } from 'ethers'

const RELAYUP_ABI = [
  'function totalSupply() public view override returns (uint256)',
  'function balanceOf(address owner) public view returns (uint256)',
  'function ownerOf(uint256 tokenId) public view returns (address)'
]

@Injectable()
export class UserBalancesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserBalancesService.name)

  private mainnetJsonRpc?: string
  private mainnetProvider: ethers.JsonRpcProvider

  private relayupNftContractAddress?: string
  private relayupNftContract?: Contract

  constructor(
    private readonly config: ConfigService<{
      MAINNET_JSON_RPC: string,
      RELAY_UP_NFT_CONTRACT_ADDRESS: string
    }>
  ) {
    this.relayupNftContractAddress = this.config.get<string>(
      'RELAY_UP_NFT_CONTRACT_ADDRESS', { infer: true }
    )

    this.mainnetJsonRpc = this.config.get<string>(
      'MAINNET_JSON_RPC',
      { infer: true }
    )

    if (!this.mainnetJsonRpc) {
      this.logger.error('Missing MAINNET_JSON_RPC!')
    } else if (!this.relayupNftContractAddress) {
      this.logger.error('Missing RELAYUP NFT Contract address!')
    } else {
      this.mainnetProvider = new ethers.JsonRpcProvider(this.mainnetJsonRpc)
      this.relayupNftContract = new Contract(
        this.relayupNftContractAddress,
        RELAYUP_ABI,
        this.mainnetProvider
      )

      this.logger.log(
        `Initialized user balance service for RELAYUP NFT Contract: ${this.relayupNftContractAddress}`
      )
    }
  }

  async onApplicationBootstrap() {
    this.logger.log(`Bootstrapped User Balances Service`)
  }

  async isOwnerOfRelayupNft(
    address: string,
    nftId: bigint
  ) {
    if (!this.relayupNftContract) {
      this.logger.error(
        `Could not check owner of RELAYUP NFT #${nftId}: No Contract`
      )

      return false
    }

    const owner = await this.relayupNftContract.ownerOf(nftId)

    return address === owner
  }
}
