import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { FacilitatorUpdatesQueue } from './processors/facilitator-updates-queue';
import { DistributionModule } from 'src/distribution/distribution.module';

@Module({
  imports: [
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
    BullModule.registerQueue({ name: 'facilitator-updates-queue' }),
    BullModule.registerFlowProducer({ name: 'facilitator-updates-flow' }),
    DistributionModule,
  ],
  providers: [EventsService, FacilitatorUpdatesQueue],
  exports: [EventsService]
})
export class EventsModule {}
