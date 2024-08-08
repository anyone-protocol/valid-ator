import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import {
  PopulateRelayUptimeJob,
  RelayUptimeJobSchema
} from './populate-relay-uptime-job'
import { PopulateRelayUptimeCommand } from './populate-relay-uptime.command'
import {
  RelayData,
  RelayDataSchema
} from '../../../src/validation/schemas/relay-data'
import {
  UptimeValidationService
} from '../../../src/validation/uptime-validation.service'
import {
  RelayUptime,
  RelayUptimeSchema
} from '../../../src/validation/schemas/relay-uptime'

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PopulateRelayUptimeJob.name, schema: RelayUptimeJobSchema },
      { name: RelayData.name, schema: RelayDataSchema },
      { name: RelayUptime.name, schema: RelayUptimeSchema }
    ])
  ],
  providers: [
    UptimeValidationService,
    ...PopulateRelayUptimeCommand.registerWithSubCommands()
  ],
  exports: [ PopulateRelayUptimeCommand ]
})
export class PopulateRelayUptimeModule {}
