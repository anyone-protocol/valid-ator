import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ValidationQueue } from './processors/validation-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { ValidationModule } from 'src/validation/validation.module'
import { VerificationQueue } from './processors/verification-queue'
import { VerificationModule } from 'src/verification/verification.module'
import { DistributionQueue } from './processors/distribution-queue'
import { DistributionModule } from 'src/distribution/distribution.module'
import {
    TaskServiceData,
    TaskServiceDataSchema,
} from './schemas/task-service-data'
import { MongooseModule } from '@nestjs/mongoose'
import { BalanceChecksQueue } from './processors/balance-checks-queue'
import { ChecksModule } from 'src/checks/checks.module'
import { ClusterModule } from 'src/cluster/cluster.module'

@Module({
    imports: [
        ValidationModule,
        VerificationModule,
        DistributionModule,
        ChecksModule,
        ClusterModule,
        BullModule.registerQueue({ name: 'tasks-queue' }),
        BullModule.registerQueue({
            name: 'validation-queue',
            streams: { events: { maxLen: 5000 } }
        }),
        BullModule.registerFlowProducer({ name: 'validation-flow' }),
        BullModule.registerQueue({ name: 'verification-queue' }),
        BullModule.registerFlowProducer({ name: 'verification-flow' }),
        BullModule.registerQueue({ name: 'distribution-queue' }),
        BullModule.registerFlowProducer({ name: 'distribution-flow' }),
        BullModule.registerQueue({ name: 'balance-checks-queue' }),
        BullModule.registerFlowProducer({ name: 'balance-checks-flow' }),
        MongooseModule.forFeature([
            {
                name: TaskServiceData.name,
                schema: TaskServiceDataSchema,
            },
        ]),
    ],
    providers: [
        TasksService,
        TasksQueue,
        ValidationQueue,
        VerificationQueue,
        DistributionQueue,
        BalanceChecksQueue,
    ],
    exports: [TasksService],
})
export class TasksModule {}
