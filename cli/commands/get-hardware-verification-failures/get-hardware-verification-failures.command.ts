import { Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { writeFileSync } from 'fs'
import { Model } from 'mongoose'
import { Command, CommandRunner } from 'nest-commander'
import {
  HardwareVerificationFailure
} from '../../../src/verification/schemas/hardware-verification-failure'

@Command({ name: 'get-hardware-verification-failures' })
export class GetHardwareVerificationFailuresCommand extends CommandRunner {
  private readonly logger = new Logger(
    GetHardwareVerificationFailuresCommand.name
  )

  constructor(
    @InjectModel(HardwareVerificationFailure.name)
    private readonly hardwareVerificationFailureModel:
      Model<HardwareVerificationFailure>
  ) {
    super()
  }

  async run(params: string[]) {
    this.logger.log('Fetching hardware verification failures')

    const outputPath = params[0] || './hardware-verification-failures.json'

    const failures = await this.hardwareVerificationFailureModel
      .find()
      .sort({ timestamp: -1 })

    this.logger.log(
      `Writing ${failures.length} hardware verification failures`
        + ` to ${outputPath}`
    )

    writeFileSync(outputPath, JSON.stringify(failures, undefined, 2) + '\n')

    this.logger.log(
      `Wrote ${failures.length} hardware verification failures to ${outputPath}`
    )

    return
  }
}
