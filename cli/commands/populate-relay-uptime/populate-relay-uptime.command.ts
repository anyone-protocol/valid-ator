import { Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import _ from 'lodash'
import { Model } from 'mongoose'
import { Command, CommandRunner } from 'nest-commander'

import { PopulateRelayUptimeJob } from './populate-relay-uptime-job'
import extractIsodate from '../../../src/util/extract-isodate'
import {
  UptimeValidationService
} from '../../../src/validation/uptime-validation.service'
import { RelayData } from '../../../src/validation/schemas/relay-data'

@Command({ name: 'populate-relay-uptime' })
export class PopulateRelayUptimeCommand extends CommandRunner {
  private readonly logger = new Logger(PopulateRelayUptimeCommand.name)

  constructor(
    private readonly uptimeValidationService: UptimeValidationService,
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

  async run() {
    this.logger.log('Starting populate relay uptime job')
    const startDate = await this.determineStartDate()
    
    if (!startDate) {
      this.logger.log(
        'Could not determine start date, likely due to no RelayData'
      )
      return
    }

    const now = new Date()
    const endDateTimestamp = now.setDate(now.getDate() - 1)
    const endDate = extractIsodate(endDateTimestamp)

    const validation_dates: string[] = []
    let currentTimestamp = new Date(startDate).getTime()
    while (currentTimestamp <= endDateTimestamp) {
      validation_dates.push(extractIsodate(currentTimestamp))

      const d = new Date(currentTimestamp)
      currentTimestamp = d.setDate(d.getDate() + 1)
    }

    this.logger.log(
      `Found dates needing relay uptime calcs: ${validation_dates.toString()}`
    )

    for (const validation_date of validation_dates) {
      this.logger.log(`Populating relay uptime data for ${validation_date}`)
      const existingJobRun = await this.populateRelayUptimeJobModel.findOne({
        success: true,
        validation_date
      })

      if (existingJobRun) {
        this.logger.log(`Already ran job for ${validation_date}, skipping`)
  
        continue
      }
  
      const jobRun = await this.populateRelayUptimeJobModel
        .create<PopulateRelayUptimeJob>({
          validation_date,
          uptimeMinimumRunningCount:
            this.uptimeValidationService.uptimeMinimumRunningCount
        })
  
      try {
        await this.uptimeValidationService.populateRelayUptimesForDate(
          validation_date
        )
        jobRun.success = true
      } catch (error) {
        jobRun.success = false
        this.logger.log(`Job failed due to error`, error.stack)
      }
  
      jobRun.finishedAt = Date.now()
      // TODO -> await jobRun.save()
    }
  }
}
