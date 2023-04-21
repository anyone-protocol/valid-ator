import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OnionooService } from 'src/onionoo/onionoo.service';
import { OnionooQueue } from './processors/onionoo-queue';
import { TasksQueue } from './processors/tasks-queue';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
    BullModule.registerQueue({ name: 'tasks-queue' }),
    BullModule.registerQueue({ name: 'onionoo-queue' }),
    BullModule.registerFlowProducer({ name: 'tasks-flow' }),
  ],
  providers: [TasksService, TasksQueue, OnionooQueue, OnionooService]
})
export class TasksModule { }
