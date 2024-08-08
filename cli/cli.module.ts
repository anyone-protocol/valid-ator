import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import {
  PopulateRelayUptimeModule
} from './commands/populate-relay-uptime/populate-relay-uptime.module'
import { SeedModule } from './commands/seed/seed.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService<{ MONGO_URI: string }>],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', { infer: true })
      })
    }),
    PopulateRelayUptimeModule,
    SeedModule
  ]
})
export class CliModule {}
