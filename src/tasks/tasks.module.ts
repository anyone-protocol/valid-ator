import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ValidationQueue } from './processors/validation-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { ConfigService } from '@nestjs/config'
import { ValidationModule } from 'src/validation/validation.module'
import { VerificationQueue } from './processors/verification-queue'
import { VerificationModule } from 'src/verification/verification.module'
import { DistributionQueue } from './processors/distribution-queue'
import { DistributionModule } from 'src/distribution/distribution.module'
import { EventsModule } from 'src/events/events.module'
import { FacilitatorUpdatesQueue } from './processors/facilitator-updates-queue'

@Module({
    imports: [
        ValidationModule,
        VerificationModule,
        DistributionModule,
        EventsModule,
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{
                    REDIS_HOSTNAME: string
                    REDIS_PORT: number
                }>,
            ) => ({
                connection: {
                    host: config.get<string>('REDIS_HOSTNAME', { infer: true }),
                    port: config.get<number>('REDIS_PORT', { infer: true }),
                },
            }),
        }),
        BullModule.registerQueue({ name: 'tasks-queue' }),
        BullModule.registerQueue({ name: 'validation-queue' }),
        BullModule.registerFlowProducer({ name: 'validation-flow' }),
        BullModule.registerQueue({ name: 'verification-queue' }),
        BullModule.registerFlowProducer({ name: 'verification-flow' }),
        BullModule.registerQueue({ name: 'distribution-queue' }),
        BullModule.registerFlowProducer({ name: 'distribution-flow' }),
        BullModule.registerQueue({ name: 'facilitator-updates-queue' }),
        BullModule.registerFlowProducer({ name: 'facilitator-updates-flow' }),
    ],
    providers: [TasksService, TasksQueue, ValidationQueue, VerificationQueue, DistributionQueue, FacilitatorUpdatesQueue],
    exports: [TasksService]
})
export class TasksModule {}
