import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { OnionooQueue } from './processors/onionoo-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { OnionooModule } from 'src/onionoo/onionoo.module'

@Module({
    imports: [
        OnionooModule,
        BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
        BullModule.registerQueue({ name: 'tasks-queue' }),
        BullModule.registerQueue({ name: 'onionoo-queue' }),
        BullModule.registerFlowProducer({ name: 'tasks-flow' }),
    ],
    providers: [TasksService, TasksQueue, OnionooQueue],
})
export class TasksModule {}
