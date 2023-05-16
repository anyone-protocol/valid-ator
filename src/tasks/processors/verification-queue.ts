import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { VerificationService } from 'src/verification/verification.service'
import { RelayVerificationResult } from 'src/verification/dto/relay-verification-result'
import {
    VerificationResultDto,
    VerifiedRelays,
} from 'src/verification/dto/verification-result-dto'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import { VerificationData } from 'src/verification/schemas/verification-data'

@Processor('verification-queue')
export class VerificationQueue extends WorkerHost {
    private readonly logger = new Logger(VerificationQueue.name)

    public static readonly JOB_VERIFY_RELAY = 'verify-relay'
    public static readonly JOB_FINALIZE_VERIFICATION = 'finalize-verification'
    public static readonly JOB_STORE_VERIFICATION = 'store-verification'

    constructor(private readonly contracts: VerificationService) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<VerifiedRelays | VerificationData> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case VerificationQueue.JOB_VERIFY_RELAY:
                let verifyResult: RelayVerificationResult = 'OK'
                const jobData = job.data as ValidatedRelay
                try {
                    if (
                        jobData !== undefined &&
                        typeof job.data.fingerprint === 'string' &&
                        job.data.fingerprint.length === 40
                    ) {
                        verifyResult = await this.contracts.verifyRelay(jobData)
                    } else {
                        this.logger.log(
                            `Incorrect fingerprint [${job.data.fingerprint}]`,
                        )
                        verifyResult = 'Failed'
                    }
                } catch (e) {
                    this.logger.error(`Failed verifying validated relay`)
                    this.logger.error(e)
                    verifyResult = 'Failed'
                }

                const verifiedRelay: VerificationResultDto = {
                    fingerprint: job.data.fingerprint,
                    address: job.data.ator_public_key,
                    result: verifyResult,
                    network_weight: jobData.consensus_weight,
                }

                return [verifiedRelay]

            case VerificationQueue.JOB_FINALIZE_VERIFICATION:
                const verificationResults: VerifiedRelays = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

                if (verificationResults.length > 0) {
                    try {
                        this.logger.debug(`Finalizing verification ${job.data}`)

                        return await this.contracts.finalizeVerification(
                            verificationResults,
                        )
                    
                    } catch (e) {
                        this.logger.error(`Failed finalizing verification of ${verificationResults.length} relay(s)`)
                        this.logger.error(e)
                        return []
                    }
                } else {
                    this.logger.debug(`${job.data}> No data was published`)

                    return []
                }

            case VerificationQueue.JOB_STORE_VERIFICATION:
                const verifiedRelays: VerifiedRelays = Object.values(
                    await job.getChildrenValues(),
                ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

                if (verifiedRelays.length > 0) {
                    try {
                        this.logger.debug(
                            `Persisting verification of ${verifiedRelays.length} relays`,
                        )

                        return await this.contracts.storeVerification(
                            verifiedRelays,
                        )
                        
                    } catch (e) {
                        this.logger.error(`Failed storing verification of ${verifiedRelays.length} relay(s)`)
                        this.logger.error(e)
                        return []
                    }
                } else {
                    this.logger.log(`No verified relays found to store`)
                    return []
                }

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
                return []
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
