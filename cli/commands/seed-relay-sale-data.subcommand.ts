import { InjectModel } from '@nestjs/mongoose'
import fs from 'fs'
import { Model } from 'mongoose'
import { CommandRunner, Option, SubCommand } from 'nest-commander'

import { SeedLock } from './seed-lock'
import { RelaySaleData } from '../../src/verification/schemas/relay-sale-data'

@SubCommand({ name: 'relay-sale-data' })
export class RelaySaleDataSubCommand extends CommandRunner {
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
      console.error(`File not found: ${path}`)
      process.exit(1)
    }

    return path
  }

  async run(params: string[], options: { data: string }): Promise<void> {
    const seedName = 'relay-sale-data'
    const existingLock = await this.seedLockModel.findOne({ seedName })

    if (existingLock) {
      console.log(
        `Found existing seed lock for ${seedName}`,
        existingLock.toObject()
      )

      return
    }

    const saleDataCsv = fs.readFileSync(options.data).toString('utf-8')
    const saleDataLines = saleDataCsv.split('\r\n')

    const seedLock = await this.seedLockModel.create<SeedLock>({ seedName })

    const session = await this.relaySaleDataModel.startSession()
    session.startTransaction()
    
    console.log(`Clearing existing ${seedName} data`)
    await this.relaySaleDataModel.deleteMany()
    
    console.log(`Seeding ${saleDataLines.length - 1} documents.`)
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

    console.log(
      `Done seeding ${saleDataLines.length - 1} ${seedName} documents.`
    )
  }
}
