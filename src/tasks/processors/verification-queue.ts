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
import { TasksService } from '../tasks.service'
import { VerificationRecovery } from 'src/verification/dto/verification-recovery'

@Processor('verification-queue')
export class VerificationQueue extends WorkerHost {
    private readonly logger = new Logger(VerificationQueue.name)

    private maxUploadRetries = 3

    public static readonly JOB_VERIFY_RELAY = 'verify-relay'
    public static readonly JOB_CONFIRM_VERIFICATION = 'confirm-verification'
    public static readonly JOB_PERSIST_VERIFICATION = 'persist-verification'
    public static readonly JOB_RECOVER_PERSIST_VERIFICATION =
        'recover-persist-verification'
    public static readonly JOB_SET_RELAY_FAMILY = 'set-relay-family'

    constructor(
        private readonly tasks: TasksService,
        private readonly verification: VerificationService,
    ) {
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
                        error.stack
                    )
                }

                const verifiedRelay: VerificationResultDto = {
                    result: verifyResult,
                    relay: validatedRelay,
                }

                return [verifiedRelay]

            case VerificationQueue.JOB_SET_RELAY_FAMILY:
                let result: RelayVerificationResult = 'Failed'
                const relay = job.data as ValidatedRelay
                try {
                    if (!relay || !relay.fingerprint || !relay.family) {
                        this.logger.log(
                            `Incorrect family [${relay.fingerprint}]`
                        )
                        return []
                    }

                    result = await this.verification.setRelayFamily(relay)

                    return [{ relay, result }]
                } catch (error) {
                    this.logger.error(
                        `Exception while setting relay family for [${relay.fingerprint}]`,
                        error.stack
                    )
                }

                return []

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
                        error.stack
                    )
                }

                return []

            case VerificationQueue.JOB_PERSIST_VERIFICATION:
                try {
                    const verificationResults: VerificationResults =
                        Object.values(await job.getChildrenValues()).reduce(
                            (prev, curr) => (prev as []).concat(curr as []),
                            [],
                        )

                    if (verificationResults.length > 0) {
                        this.logger.log(
                            `Persisting verification of ${verificationResults.length} relays`,
                        )

                        const verificationData =
                            await this.verification.persistVerification(
                                verificationResults,
                                '',
                                '',
                            )
                        if (
                            verificationData.relay_metrics_tx.length > 0 &&
                            verificationData.validation_stats_tx.length > 0
                        ) {
                            return verificationData
                        } else {
                            this.tasks.verificationQueue.add(
                                VerificationQueue.JOB_RECOVER_PERSIST_VERIFICATION,
                                {
                                    retriesLeft: this.maxUploadRetries,
                                    verificationResults: verificationResults,
                                    verificationData: verificationData,
                                },
                            )
                        }
                    } else {
                        this.logger.debug(`No verified relays found to store`)
                    }
                } catch (error) {
                    this.logger.error(
                        `Exception while persisting verification results`,
                        error.stack
                    )
                }
                return undefined

            case VerificationQueue.JOB_RECOVER_PERSIST_VERIFICATION:
                try {
                    const data = job.data as VerificationRecovery
                    if (data.retriesLeft > 0) {
                        if (data.verificationResults.length > 0) {
                            this.logger.warn(
                                `Recover persisting verification of ${data.verificationResults.length} relays (retries left: ${data.retriesLeft})`,
                            )

                            const result =
                                await this.verification.persistVerification(
                                    data.verificationResults,
                                    data.verificationData.relay_metrics_tx,
                                    data.verificationData.validation_stats_tx,
                                )
                            if (
                                result.relay_metrics_tx.length > 0 &&
                                result.validation_stats_tx.length > 0
                            ) {
                                return result
                            } else {
                                this.tasks.verificationQueue.add(
                                    VerificationQueue.JOB_RECOVER_PERSIST_VERIFICATION,
                                    {
                                        retriesLeft: data.retriesLeft - 1,
                                        verificationResults:
                                            data.verificationResults,
                                        verificationData: data.verificationData,
                                    },
                                )
                            }
                        } else {
                            this.logger.debug(
                                `No verified relays found to store`,
                            )
                        }
                    } else {
                        this.logger.error(
                            `No more retries left on persisting verification.`,
                            data.verificationData,
                        )
                    }
                } catch (error) {
                    this.logger.error(
                        `Exception while persisting verification results`,
                        error.stack
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
