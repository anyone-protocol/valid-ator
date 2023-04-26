import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { OnionooQueue } from './processors/onionoo-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { OnionooModule } from 'src/onionoo/onionoo.module'
import { ConfigService } from '@nestjs/config'

@Module({
    imports: [
        OnionooModule,
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{ REDIS_HOSTNAME: string, REDIS_PORT: number }>
            ) => ({ connection: { 
                host: config.get<string>('REDIS_HOSTNAME', { infer: true }), 
                port: config.get<number>('REDIS_PORT', { infer: true }) 
            } })
        }),
        BullModule.registerQueue({ name: 'tasks-queue' }),
        BullModule.registerQueue({ name: 'onionoo-queue' }),
        BullModule.registerFlowProducer({ name: 'tasks-flow' }),
    ],
    providers: [TasksService, TasksQueue, OnionooQueue],
})
export class TasksModule {}
