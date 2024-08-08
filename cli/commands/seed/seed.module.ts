import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { SeedCommand } from './seed.command'
import { SeedLock, SeedLockSchema } from './seed-lock'
import {
  RelaySaleData,
  RelaySaleDataSchema
} from '../../../src/verification/schemas/relay-sale-data'

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: RelaySaleData.name, schema: RelaySaleDataSchema },
      { name: SeedLock.name, schema: SeedLockSchema }
    ])
  ],
  providers: [ ...SeedCommand.registerWithSubCommands() ],
  exports: [ SeedCommand ]
})
export class SeedModule {}
