import { Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import _ from 'lodash'
import { Document, Model, Types } from 'mongoose'
import { Command, CommandRunner } from 'nest-commander'

import { PopulateRelayUptimeJob } from './populate-relay-uptime-job'
import extractIsodate from '../../../src/util/extract-isodate'
import {
  UptimeValidationService
} from '../../../src/validation/uptime-validation.service'
import { RelayData } from '../../../src/validation/schemas/relay-data'
import {
  DistributionService
} from '../../../src/distribution/distribution.service'
import { RelayUptime } from 'src/validation/schemas/relay-uptime'

@Command({ name: 'populate-relay-uptime' })
export class PopulateRelayUptimeCommand extends CommandRunner {
  static setUptimesBatchSize = 12

  private readonly logger = new Logger(PopulateRelayUptimeCommand.name)

  constructor(
    private readonly uptimeValidationService: UptimeValidationService,
    private readonly distributionService: DistributionService,
    @InjectModel(PopulateRelayUptimeJob.name)
    private readonly populateRelayUptimeJobModel: Model<PopulateRelayUptimeJob>,
    @InjectModel(RelayData.name)
    private readonly relayDataModel: Model<RelayData>
  ) {
    super()
  }

  private async determineStartDate() {
    const lastJobRun = await this.populateRelayUptimeJobModel
      .findOne({ success: true })
      .sort({ validation_date: -1 })

    if (!lastJobRun) {
      this.logger.log(
        'Did not find last job run, checking RelayData to determine start date'
      )
      const earliestRelayData = await this.relayDataModel
        .findOne()
        .sort({ validated_at: 1 })

      if (!earliestRelayData) {
        return null
      }

      const startDate = extractIsodate(earliestRelayData.validated_at)

      this.logger.log(`Found earliest RelayData at ${startDate}`)

      return startDate
    }

    this.logger.log(`Found previous job run ${lastJobRun.validation_date}`)
    const startDate = new Date(lastJobRun.validation_date)
 
    return extractIsodate(startDate.setDate(startDate.getDate() + 1))
  }

  private determineValidationDates(startDate: string) {
    const now = new Date()
    const endDateTimestamp = now.setDate(now.getDate() - 1)
    const validation_dates: string[] = []
    let currentTimestamp = new Date(startDate).getTime()
    while (currentTimestamp <= endDateTimestamp) {
      validation_dates.push(extractIsodate(currentTimestamp))

      const d = new Date(currentTimestamp)
      currentTimestamp = d.setDate(d.getDate() + 1)
    }

    return validation_dates
  }

  private async runPopulateRelayUptimeJobsAndReturnLatest(
    validation_dates: string[]
  ): Promise<
    (
      Document<unknown, {}, PopulateRelayUptimeJob>
        & PopulateRelayUptimeJob
        & { _id: Types.ObjectId }
    ) | null
  > {
    let latestJob: (
      Document<unknown, {}, PopulateRelayUptimeJob>
        & PopulateRelayUptimeJob
        & { _id: Types.ObjectId }
    ) | null = null

    for (const validation_date of validation_dates) {
      this.logger.log(`Populating relay uptime data for ${validation_date}`)
      const existingJobRun = await this.populateRelayUptimeJobModel.findOne({
        success: true,
        validation_date
      })

      if (existingJobRun) {
        this.logger.log(`Found successful job run for ${validation_date}`)
        latestJob = existingJobRun
      } else {
        this.logger.log(`No job run found for ${validation_date}, creating it`)
        const createdJob = await this.populateRelayUptimeJobModel
          .create<PopulateRelayUptimeJob>({
            validation_date,
            uptimeMinimumRunningCount:
              this.uptimeValidationService.uptimeMinimumRunningCount,
              uptimes: []
          })
    
        try {
          const uptimes = await this
            .uptimeValidationService
            .populateRelayUptimesForDate(validation_date)
          createdJob.uptimes = uptimes.map(
            ({ fingerprint, uptime_days }) =>
              ({ fingerprint, uptime_days, pushed: false })
          )
          createdJob.success = true
        } catch (error) {
          createdJob.success = false
          this.logger.log(`Job failed due to error`, error.stack)
        }
    
        createdJob.finishedAt = Date.now()
        await createdJob.save()
        latestJob = createdJob
      }
    }

    return latestJob
  }

  async run() {
    this.logger.log('Starting populate relay uptime job')
    const startDate = await this.determineStartDate()
    
    if (!startDate) {
      this.logger.log(
        'Could not determine start date, likely due to no RelayData'
      )
      return
    }

    const validation_dates = this.determineValidationDates(startDate)

    this.logger.log(
      `Found dates needing relay uptime calcs: ${validation_dates.toString()}`
    )

    const latestJobRun = await this.runPopulateRelayUptimeJobsAndReturnLatest(
      validation_dates
    )

    if (!latestJobRun) {
      this.logger.log('Did not receive latest job run, exiting')
      return
    }

    const uptimesToPush = latestJobRun.uptimes.filter(u => !u.pushed)
    if (uptimesToPush.length < 1) {
      this.logger.log(
        `No uptimes to push to distribution contract for ${latestJobRun.validation_date}`
      )
      return
    }

    const batches = _.chunk(
      uptimesToPush,
      PopulateRelayUptimeCommand.setUptimesBatchSize
    )
    for (const batch of batches) {
      const { success } = await this.distributionService.setRelayUptimes(batch)
      const successfulFingerprints = batch.map(u => u.fingerprint)
      if (success) {
        for (let i = 0; i < latestJobRun.uptimes.length; i++) {
          if (
            successfulFingerprints.includes(latestJobRun.uptimes[i].fingerprint)
          ) {
            latestJobRun.uptimes[i].pushed = true
          }
        }
        await latestJobRun.save()
      }
    }
  }
}
