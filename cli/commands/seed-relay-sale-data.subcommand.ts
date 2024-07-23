import { Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import fs from 'fs'
import { Model } from 'mongoose'
import { CommandRunner, Option, SubCommand } from 'nest-commander'

import { SeedLock, SeedLockDocument } from './seed-lock'
import { RelaySaleData } from '../../src/verification/schemas/relay-sale-data'


@SubCommand({ name: 'relay-sale-data' })
export class RelaySaleDataSubCommand extends CommandRunner {
  private readonly seedName = 'relay-sale-data'
  private readonly logger = new Logger(RelaySaleDataSubCommand.name)

  constructor(
    @InjectModel(SeedLock.name)
    private readonly seedLockModel: Model<SeedLock>,
    @InjectModel(RelaySaleData.name)
    private readonly relaySaleDataModel: Model<RelaySaleData>
  ) {
    super()
  }

  @Option({
    flags: '-d, --data <data-path>',
    description: 'Path to CSV seed data',
    required: true
  })
  parseSeedFilePath(path: string) {
    const exists = fs.existsSync(path)

    if (!exists) {
      this.logger.error(`File not found: ${path}`)
      process.exit(1)
    }

    return path
  }

  async run(
    params: string[],
    options: { data: string }
  ): Promise<void> {
    const existingLock = await this.seedLockModel.findOne({
      seedName: this.seedName
    })

    if (params.includes('down')) {
      return this.down(existingLock)
    } else {
      return this.up(existingLock, options.data)
    }
  }

  private async up(
    existingLock: SeedLockDocument | null,
    dataFilePath: string
  ) {
    if (existingLock) {
      this.logger.log(
        `Found existing seed lock for ${this.seedName}`,
        existingLock.toObject()
      )

      return
    }

    const saleDataCsv = fs.readFileSync(dataFilePath).toString('utf-8')
    const saleDataLines = saleDataCsv.split('\r\n')

    const seedLock = await this.seedLockModel.create<SeedLock>({
      seedName: this.seedName
    })

    const session = await this.relaySaleDataModel.startSession()
    session.startTransaction()
    
    this.logger.log(`Clearing existing ${this.seedName} data`)
    await this.relaySaleDataModel.deleteMany()
    
    this.logger.log(
      `Seeding ${saleDataLines.length - 1} ${this.seedName} documents.`
    )
    for (let i = 1; i < saleDataLines.length; i++) {
      const [ serial, unparsedNftId ] = saleDataLines[i].split(',')
      const parsedNftId = Number.parseInt(unparsedNftId)
      const nftId = Number.isNaN(parsedNftId) ? 0 : parsedNftId

      await this.relaySaleDataModel.create<RelaySaleData>({ serial, nftId })
    }

    await session.commitTransaction()
    await session.endSession()

    seedLock.finishedAt = Date.now()
    await seedLock.save()

    this.logger.log(
      `Done seeding ${saleDataLines.length - 1} ${this.seedName} documents.`
    )
  }

  private async down(existingLock: SeedLockDocument | null) {
    if (!existingLock) {
      this.logger.log(`No seed lock found for ${this.seedName}, nothing to remove`)

      return
    }

    this.logger.log(
      `Removing existing seed lock for ${this.seedName}`,
      existingLock
    )
    await existingLock.deleteOne()

    this.logger.log(`Removing existing ${this.seedName} seed data`)
    const result = await this.relaySaleDataModel.deleteMany()
    this.logger.log(`Removed ${result.deletedCount}`)
  }
}
