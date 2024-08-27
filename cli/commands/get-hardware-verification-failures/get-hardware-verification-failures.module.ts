import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import {
  GetHardwareVerificationFailuresCommand
} from './get-hardware-verification-failures.command'
import {
  HardwareVerificationFailure,
  HardwareVerificationFailureSchema
} from 'src/verification/schemas/hardware-verification-failure'

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: HardwareVerificationFailure.name,
        schema: HardwareVerificationFailureSchema
      }
    ])
  ],
  providers: [
    ...GetHardwareVerificationFailuresCommand.registerWithSubCommands()
  ],
  exports: [ GetHardwareVerificationFailuresCommand ]
})
export class GetHardwareProofFailsModule {}
