import { Module } from '@nestjs/common'
import { EventsService } from './events.service'
import { BullModule } from '@nestjs/bullmq'
import { FacilitatorUpdatesQueue } from './processors/facilitator-updates-queue'
import { DistributionModule } from 'src/distribution/distribution.module'
import { ClusterModule } from 'src/cluster/cluster.module'

@Module({
    imports: [
        DistributionModule,
        ClusterModule,
        BullModule.registerQueue({ name: 'facilitator-updates-queue' }),
        BullModule.registerFlowProducer({ name: 'facilitator-updates-flow' }),
    ],
    providers: [EventsService, FacilitatorUpdatesQueue],
    exports: [EventsService],
})
export class EventsModule {}
