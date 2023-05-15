import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ValidationQueue } from './processors/validation-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { ConfigService } from '@nestjs/config'
import { OnionooModule } from 'src/onionoo/onionoo.module'
import { VerificationQueue } from './processors/verification-queue'
import { ContractsModule } from 'src/contracts/contracts.module'

@Module({
    imports: [
        OnionooModule,
        ContractsModule,
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
        BullModule.registerQueue({ name: 'verification-queue' }),
        BullModule.registerFlowProducer({ name: 'validation-flow' }),
        BullModule.registerFlowProducer({ name: 'verification-flow' }),
    ],
    providers: [TasksService, TasksQueue, ValidationQueue, VerificationQueue],
})
export class TasksModule {}
