import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { VerificationService } from 'src/verification/verification.service'
import { RelayVerificationResult } from 'src/verification/dto/relay-verification-result'
import {
    VerificationResultDto,
    VerificationResults,
} from 'src/verification/dto/verification-result-dto'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import { VerificationData } from 'src/verification/schemas/verification-data'

@Processor('verification-queue')
export class VerificationQueue extends WorkerHost {
    private readonly logger = new Logger(VerificationQueue.name)

    public static readonly JOB_VERIFY_RELAY = 'verify-relay'
    public static readonly JOB_CONFIRM_VERIFICATION = 'confirm-verification'
    public static readonly JOB_PERSIST_VERIFICATION = 'persist-verification'

    constructor(private readonly verification: VerificationService) {
        super()
    }

    async process(
        job: Job<any, any, string>,
    ): Promise<VerificationResults | VerificationData | undefined> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case VerificationQueue.JOB_VERIFY_RELAY:
                let verifyResult: RelayVerificationResult = 'Failed'
                const validatedRelay = job.data as ValidatedRelay
                try {
                    if (
                        validatedRelay !== undefined &&
                        validatedRelay.fingerprint.length === 40
                    ) {
                        verifyResult = await this.verification.verifyRelay(
                            validatedRelay,
                        )
                    } else {
                        this.logger.log(
                            `Incorrect fingerprint [${job.data.fingerprint}]`,
                        )
                    }
                } catch (error) {
                    this.logger.error(
                        'Exception while verifying validated relay:',
                        error,
                    )
                }

                const verifiedRelay: VerificationResultDto = {
                    result: verifyResult,
                    relay: validatedRelay,
                }

                return [verifiedRelay]

            case VerificationQueue.JOB_CONFIRM_VERIFICATION:
                try {
                    const verificationResults: VerificationResults =
                        Object.values(await job.getChildrenValues()).reduce(
                            (prev, curr) => (prev as []).concat(curr as []),
                            [],
                        )

                    if (verificationResults.length > 0) {
                        this.logger.debug(`Finalizing verification ${job.data}`)
                        this.verification.logVerification(verificationResults)

                        return verificationResults
                    } else {
                        this.logger.debug(`${job.data}> No data was published`)
                    }
                } catch (error) {
                    this.logger.error(
                        `Exception while confirming verification of relay(s)`,
                        error,
                    )
                }

                return []

            case VerificationQueue.JOB_PERSIST_VERIFICATION:
                try {
                    const verifiedRelays: VerificationResults = Object.values(
                        await job.getChildrenValues(),
                    ).reduce(
                        (prev, curr) => (prev as []).concat(curr as []),
                        [],
                    )

                    if (verifiedRelays.length > 0) {
                        this.logger.debug(
                            `Persisting verification of ${verifiedRelays.length} relays`,
                        )

                        return await this.verification.persistVerification(
                            verifiedRelays,
                        )
                    } else {
                        this.logger.debug(`No verified relays found to store`)
                    }
                } catch (error) {
                    this.logger.error(
                        `Exception while persisting verification results`,
                        error,
                    )
                }
                return undefined

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
                return undefined
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
