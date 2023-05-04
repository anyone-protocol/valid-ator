import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { TasksService } from '../tasks.service'
import { ContractsService } from 'src/contracts/contracts.service'
import { VerificationResultDto } from 'src/contracts/dto/verification-result-dto'
import { RelayVerificationResult } from 'src/contracts/dto/relay-verification-result'
import { ConfigService } from '@nestjs/config'

@Processor('publishing-queue')
export class PublishingQueue extends WorkerHost {
    private readonly logger = new Logger(PublishingQueue.name)

    public static readonly JOB_PUBLISH_VALIDATED_RELAY =
        'publish-validated-relay'
    public static readonly JOB_FINALIZE_PUBLISH = 'finalize-publish'

    constructor(
        private readonly tasks: TasksService,
        private readonly contracts: ContractsService
    ) {
        super()
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

        switch (job.name) {
            case PublishingQueue.JOB_PUBLISH_VALIDATED_RELAY:
                let verifyResult: RelayVerificationResult = 'OK'

                try {
                    if (
                        job.data.fingerprint !== undefined &&
                        typeof job.data.fingerprint === 'string' &&
                        job.data.fingerprint.length === 40
                    ) {
                        this.logger.log(
                            `Verifying validated relay [${job.data.fingerprint}]`,
                        )
                        verifyResult = await this.contracts.verifyRelay(job.data)
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

                return [
                    {
                        fingerprint: job.data.fingerprint,
                        address: job.data.ator_public_key,
                        result: verifyResult,
                    },
                ]

            case PublishingQueue.JOB_FINALIZE_PUBLISH:
                const verificationResults: VerificationResultDto[] =
                    Object.values(await job.getChildrenValues()).reduce(
                        (prev, curr) => (prev as []).concat(curr as []),
                        [],
                    )

                if (verificationResults.length > 0) {
                    this.logger.log(
                        `Finished publishing data from validation ${job.data}`,
                    )
                    const failed = verificationResults.filter(
                        (value, index, array) => value.result === 'Failed',
                    )
                    if (failed.length > 0) {
                        this.logger.log(
                            `${job.data}> Failed publishing verification of ${failed.length} relay(s): [${
                                failed.map((relay,index,array) => relay.fingerprint ).join(', ')
                            }]`,
                        )
                    }

                    const notRegistered = verificationResults.filter(
                        (value, index, array) =>
                            value.result === 'NotRegistered',
                    )
                    if (notRegistered.length > 0) {
                        this.logger.log(
                            `${job.data}> Skipped ${notRegistered.length} not registered relay(s): [${
                                notRegistered.map((relay,index,array) => relay.fingerprint ).join(', ')
                            }]`,
                        )
                    }

                    const alreadyVerified = verificationResults.filter(
                        (value, index, array) =>
                            value.result === 'AlreadyVerified',
                    )
                    if (alreadyVerified.length > 0) {
                        this.logger.log(
                            `${job.data}> Skipped ${alreadyVerified.length} verified relay(s)`,
                        )
                    }

                    const ok = verificationResults.filter(
                        (value, index, array) => value.result === 'OK',
                    )
                    if (ok.length > 0) {
                        this.logger.log(
                            `${job.data}> Published verification of ${ok.length} relay(s)`,
                        )
                    }
                } else {
                    this.logger.log(
                        `${job.data}> No data was published`,
                    )
                }

                break

            default:
                this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<any, any, string>) {
        this.logger.debug(`Finished ${job.name} [${job.id}]`)
    }
}
