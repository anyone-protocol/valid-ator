import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { BalancesService } from 'src/checks/balances.service'
import { BalancesData } from 'src/checks/schemas/balances-data'

@Processor('balance-checks-queue')
export class BalanceChecksQueue extends WorkerHost {
    private readonly logger = new Logger(BalanceChecksQueue.name)

    public static readonly JOB_CHECK_RELAY_REGISTRY_OPERATOR = 'check-relay-registry-operator'
    public static readonly JOB_CHECK_DISTRIBUTION_OPERATOR = 'check-distribution-operator'
    public static readonly JOB_CHECK_FACILITY_OPERATOR = 'check-facility-operator'
    public static readonly JOB_PUBLISH_BALANCE_CHECKS = 'publish-balance-checks'

    constructor(
        private readonly balanceChecks: BalancesService,
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            // verification service - bundlr upload (metrics, stats) + claiming relays
            case BalanceChecksQueue.JOB_CHECK_RELAY_REGISTRY_OPERATOR:
                const relayRegistryUploadBalance = await this.balanceChecks.getRelayServiceUploadBalance()
                const relayRegistryOperatorBalance = await this.balanceChecks.getRelayServiceOperatorBalance()
                
                return {
                    'relayRegistryUploader': relayRegistryUploadBalance.toString(),
                    'relayRegistryOperator': relayRegistryOperatorBalance.toString()
                }

            // distribution service - addScores, distribute
            case BalanceChecksQueue.JOB_CHECK_DISTRIBUTION_OPERATOR:
                const distributionOperatorBalance = await this.balanceChecks.getDistributionOperatorBalance()
                    
                return {
                    'distributionOperator': distributionOperatorBalance.toString()
                }

            // events service - updateAllocation gas + token
            case BalanceChecksQueue.JOB_CHECK_FACILITY_OPERATOR:
                const facilityOperatorBalance = await this.balanceChecks.getFacilityOperatorBalance()
                const facilityTokenBalance = await this.balanceChecks.getFacilityTokenBalance()
                    
                return {
                    'facilityOperator': facilityOperatorBalance.toString(),
                    'facilityTokens': facilityTokenBalance.toString()
                }

            case BalanceChecksQueue.JOB_PUBLISH_BALANCE_CHECKS:
                const balanceChecks = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => ({ ...prev, ...curr }), {})

                const balancesData: BalancesData = {
                    ...balanceChecks,
                    stamp: Date.now()
                }

                const publishResult = await this.balanceChecks.publishBalanceChecks(balancesData)
                if (!publishResult) {
                    this.logger.error('Failed publishing balance checks', balancesData)
                }
                
                return balancesData

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }

}
