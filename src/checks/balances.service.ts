import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BalancesData } from './schemas/balances-data'
import BigNumber from 'bignumber.js'
import { Wallet, ethers } from 'ethers'
import Bundlr from '@bundlr-network/client'

@Injectable()
export class BalancesService implements OnApplicationBootstrap {
    private readonly logger = new Logger(BalancesService.name)

    private isLive?: string

    private relayRegistryOperator
    private bundlr

    private distributionOperator

    private facilityOperator: ethers.Wallet
    private facilityAddress: string | undefined

    private erc20Abi = [
        'function balanceOf(address owner) view returns (uint256)',
    ]
    private tokenAddress: string | undefined

    private jsonRpc: string | undefined
    private provider: ethers.JsonRpcProvider

    constructor(
        private readonly config: ConfigService<{
            IS_LIVE: string
            TOKEN_CONTRACT_ADDRESS: string
            FACILITY_CONTRACT_ADDRESS: string
            FACILITY_OPERATOR_KEY: string
            JSON_RPC: string
            DISTRIBUTION_OPERATOR_KEY: string
            RELAY_REGISTRY_OPERATOR_KEY: string
            BUNDLR_NODE: string
            BUNDLR_NETWORK: string
        }>,
        @InjectModel(BalancesData.name)
        private readonly balancesDataModel: Model<BalancesData>,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })

        this.facilityAddress = this.config.get<string>(
            'FACILITY_CONTRACT_ADDRESS',
            { infer: true },
        )

        this.jsonRpc = this.config.get<string>('JSON_RPC', { infer: true })
        if (this.jsonRpc == undefined) {
            this.logger.error('Missing JSON_RPC. Skipping facility checks')
        } else {
            this.provider = new ethers.JsonRpcProvider(this.jsonRpc)

            const facilityOperatorKey = this.config.get<string>(
                'FACILITY_OPERATOR_KEY',
                { infer: true },
            )

            if (facilityOperatorKey == undefined) {
                this.logger.error(
                    'Missing FACILITY_OPERATOR_KEY. Skipping facility checks...',
                )
            } else {
                this.facilityOperator = new ethers.Wallet(
                    facilityOperatorKey,
                    this.provider,
                )
            }
        }

        const relayRegistryOperatorKey = this.config.get<string>(
            'RELAY_REGISTRY_OPERATOR_KEY',
            {
                infer: true,
            },
        )

        if (relayRegistryOperatorKey !== undefined) {
            this.bundlr = (() => {
                const node = config.get<string>('BUNDLR_NODE', {
                    infer: true,
                })
                const network = config.get<string>('BUNDLR_NETWORK', {
                    infer: true,
                })

                if (node !== undefined && network !== undefined) {
                    return new Bundlr(node, network, relayRegistryOperatorKey)
                } else {
                    return undefined
                }
            })()

            if (this.bundlr !== undefined) {
                this.logger.log(
                    `Initialized balance checks relay operator with address: ${this.bundlr.address}`,
                )
            } else {
                this.logger.error('Failed to initialize Bundlr!')
            }

            const signer = new Wallet(relayRegistryOperatorKey)

            this.relayRegistryOperator = {
                address: signer.address,
                key: relayRegistryOperatorKey,
                signer: signer,
            }
        }

        const distributionOperatorKey = this.config.get<string>(
            'DISTRIBUTION_OPERATOR_KEY',
            {
                infer: true,
            },
        )

        if (distributionOperatorKey !== undefined) {
            const signer = new Wallet(distributionOperatorKey)

            this.distributionOperator = {
                address: signer.address,
                key: distributionOperatorKey,
                signer: signer,
            }

            this.logger.log(
                `Initialized balance check for distribution service operator: ${this.distributionOperator.address}`,
            )
        }
    }

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log(`Bootstrapped Balance Checks Service`)
    }

    async publishBalanceChecks(data: BalancesData): Promise<boolean> {
        try {
            await this.balancesDataModel.create(data)
            return true
        } catch (error) {
            this.logger.error('Failed to store balance checks data', data)
            return false
        }
    }

    async getRelayServiceUploadBalance(): Promise<BigNumber> {
        try {
            const result = this.bundlr?.getLoadedBalance()
            if (result != undefined) {
                return result
            } else {
                this.logger.error(
                    `Failed to fetch relay service uploader loaded balance`,
                )
            }
        } catch (error) {
            this.logger.error(
                `Exception while fetching relay service uploader loaded balance`,
            )
        }
        return BigNumber(0)
    }

    async getRelayServiceOperatorBalance(): Promise<bigint> {
        if (this.relayRegistryOperator) {
            try {
                // Note - we don't use any gas here.
                const result = await this.provider.getBalance(
                    this.relayRegistryOperator.address,
                )
                if (result != undefined) {
                    return result
                } else {
                    this.logger.error(
                        `Failed to fetch relay service operator balance`,
                    )
                }
            } catch (error) {
                this.logger.error(
                    `Exception while fetching relay service operator balance`,
                )
            }
        } else {
            this.logger.error('Relay registry operator undefined')
        }
        return BigInt(0)
    }

    async getDistributionOperatorBalance(): Promise<bigint> {
        if (this.distributionOperator) {
            try {
                // Note - we don't use any gas here.
                const result = await this.provider.getBalance(
                    this.distributionOperator.address,
                )
                if (result != undefined) {
                    return result
                } else {
                    this.logger.error(
                        `Failed to fetch relay service operator balance`,
                    )
                }
            } catch (error) {
                this.logger.error(
                    `Exception while fetching relay service operator balance`,
                )
            }
        } else {
            this.logger.error('Distribution operator undefined')
        }
        return BigInt(0)
    }

    async getFacilityOperatorBalance(): Promise<bigint> {
        try {
            const result = await this.provider.getBalance(
                this.facilityOperator.address,
            )
            if (result != undefined) {
                return result
            } else {
                this.logger.error(`Failed to fetch facility operator balance`)
            }
        } catch (error) {
            this.logger.error(
                `Exception while fetching facility operator balance`,
            )
        }
        return BigInt(0)
    }

    async getFacilityTokenBalance(): Promise<bigint> {
        if (this.tokenAddress) {
            try {
                const contract = new ethers.Contract(
                    this.tokenAddress,
                    this.erc20Abi,
                    this.provider,
                )
                const result = contract.balanceOf(this.facilityAddress)
                if (result != undefined) {
                    return result
                } else {
                    this.logger.error(`Failed to fetch facility token balance`)
                }
            } catch (error) {
                this.logger.error(
                    'Exception while fetching facility token balance',
                    error,
                )
            }
        } else {
            this.logger.error(
                'Token address not provided. Unable to check facility token balance.',
            )
        }

        return BigInt(0)
    }
}
