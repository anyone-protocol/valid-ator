import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

@Processor('balances-queue')
export class BalancesQueue extends WorkerHost {
    private readonly logger = new Logger(BalancesQueue.name)

    public static readonly JOB_CHECK_RELAY_REGISTRY_OPERATOR = 'check-relay-registry-operator'
    public static readonly JOB_CHECK_DISTRIBUTION_OPERATOR = 'check-distribution-operator'
    public static readonly JOB_CHECK_FACILITY_OPERATOR = 'check-facility-operator'
    public static readonly JOB_PUBLISH_BALANCE_CHECKS = 'publish-balance-checks'

    constructor(
    ) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            // verification service - bundlr upload (metrics, stats) + claiming relays
            case BalancesQueue.JOB_CHECK_RELAY_REGISTRY_OPERATOR:
                return undefined

            // distribution service - addScores, distribute
            case BalancesQueue.JOB_CHECK_DISTRIBUTION_OPERATOR:
                return undefined

            // events service - updateAllocation
            case BalancesQueue.JOB_CHECK_FACILITY_OPERATOR:
                return undefined

            case BalancesQueue.JOB_PUBLISH_BALANCE_CHECKS:
                return undefined

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }

}
