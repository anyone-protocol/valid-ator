import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { OnionooQueue } from './processors/onionoo-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { ConfigService } from '@nestjs/config'
import { OnionooModule } from 'src/onionoo/onionoo.module'
import { PublishingQueue } from './processors/publishing-queue'
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
        BullModule.registerQueue({ name: 'onionoo-queue' }),
        BullModule.registerQueue({ name: 'publishing-queue' }),
        BullModule.registerFlowProducer({ name: 'validation-flow' }),
        BullModule.registerFlowProducer({ name: 'publishing-flow' }),
    ],
    providers: [TasksService, TasksQueue, OnionooQueue, PublishingQueue],
})
export class TasksModule {}
