import { Module } from '@nestjs/common'
import { EventsService } from './events.service'
import { BullModule } from '@nestjs/bullmq'
import { FacilitatorUpdatesQueue } from './processors/facilitator-updates-queue'
import { DistributionModule } from 'src/distribution/distribution.module'
import { ClusterModule } from 'src/cluster/cluster.module'
import { RegistratorUpdatesQueue } from './processors/registrator-updates-queue'
import { VerificationModule } from 'src/verification/verification.module'

@Module({
    imports: [
        DistributionModule,
        VerificationModule,
        ClusterModule,
        BullModule.registerQueue({ 
            name: 'facilitator-updates-queue',
            streams: { events: { maxLen: 2000 } }
        }),
        BullModule.registerFlowProducer({ name: 'facilitator-updates-flow' }),
        BullModule.registerQueue({ 
            name: 'registrator-updates-queue',
            streams: { events: { maxLen: 5000 } }
        }),
        BullModule.registerFlowProducer({ name: 'registrator-updates-flow' }),
    ],
    providers: [EventsService, FacilitatorUpdatesQueue, RegistratorUpdatesQueue],
    exports: [EventsService],
})
export class EventsModule {}
