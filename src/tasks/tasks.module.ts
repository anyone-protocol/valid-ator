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
import { BalancesData, BalancesDataSchema } from './schemas/balances-data'
import { BalancesQueue } from './processors/balances-queue'

@Module({
    imports: [
        ValidationModule,
        VerificationModule,
        DistributionModule,
        BullModule.registerQueue({ name: 'tasks-queue' }),
        BullModule.registerQueue({ name: 'validation-queue' }),
        BullModule.registerFlowProducer({ name: 'validation-flow' }),
        BullModule.registerQueue({ name: 'verification-queue' }),
        BullModule.registerFlowProducer({ name: 'verification-flow' }),
        BullModule.registerQueue({ name: 'distribution-queue' }),
        BullModule.registerFlowProducer({ name: 'distribution-flow' }),
        BullModule.registerQueue({ name: 'balances-queue' }),
        BullModule.registerFlowProducer({ name: 'balances-flow' }),
        MongooseModule.forFeature([
            {
                name: TaskServiceData.name,
                schema: TaskServiceDataSchema,
            },
            {
                name: BalancesData.name,
                schema: BalancesDataSchema,
            },
        ]),
    ],
    providers: [
        TasksService,
        TasksQueue,
        ValidationQueue,
        VerificationQueue,
        DistributionQueue,
        BalancesQueue,
    ],
    exports: [TasksService],
})
export class TasksModule {}
