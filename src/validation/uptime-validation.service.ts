import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import _ from 'lodash'
import { Model } from 'mongoose'

import { RelayData } from './schemas/relay-data'
import { RelayUptime } from './schemas/relay-uptime'
import extractIsodate from '../util/extract-isodate'

@Injectable()
export class UptimeValidationService {
  private readonly logger = new Logger(UptimeValidationService.name)

  public uptimeMinimumRunningCount: number = 16

  constructor(
    readonly config: ConfigService<{
      UPTIME_MINIMUM_RUNNING_COUNT: number
    }>,
    @InjectModel(RelayData.name)
    private readonly relayDataModel: Model<RelayData>,
    @InjectModel(RelayUptime.name)
    private readonly relayUptimeModel: Model<RelayUptime>,
  ) {
    this.uptimeMinimumRunningCount = Number.parseInt(
      config.get<string>(
        'UPTIME_MINIMUM_RUNNING_COUNT',
        { infer: true }
      ) || ''
    )

    if (
      typeof this.uptimeMinimumRunningCount !== 'number'
        && this.uptimeMinimumRunningCount <= 0
    ) {
      this.logger.error(
        `UPTIME_MINIMUM_RUNNING_COUNT env var is invalid or missing,`
        + ` using default value ${this.uptimeMinimumRunningCount}`
      )
    }
  }

  async populateRelayUptimesForDate(validation_date: string) {
    this.logger.log(`Populating relay uptime for ${validation_date}`)

    const startDate = new Date(validation_date)
    const start = startDate.getTime()
    const end = startDate.setDate(startDate.getDate() + 1)
    this.logger.log(
      `Fetching RelayData validated_at between ${start} and ${end}`
    )

    const relayDatas = await this.relayDataModel.find({
      validated_at: { $gte: start, $lt: end }
    })

    if (relayDatas.length < 1) {
      this.logger.log(`Could not find any RelayData for ${validation_date}`)

      return
    }

    this.logger.log(
      `Found ${relayDatas.length} RelayData for ${validation_date}`
    )

    const relayDatasByFingerprint = _.groupBy(
      relayDatas,
      ({ fingerprint }) => fingerprint
    )
    const fingerprints = Object.keys(relayDatasByFingerprint)

    this.logger.log(
      `Populating relay uptime on ${validation_date} for ${fingerprints.length} relays`
    )

    const validationDate = new Date(validation_date)
    const previousDate = extractIsodate(
      validationDate.setDate(validationDate.getDate() - 1)
    )

    const previousUptimes = await this
      .relayUptimeModel
      .find({ validation_date: previousDate })

    const relayUptimes: RelayUptime[] = []
    for (const fingerprint of fingerprints) {
      const relayDatas = relayDatasByFingerprint[fingerprint]
      const seenRunningCount = relayDatas
        .filter(({ running }) => running)
        .length
      const previousUptime = previousUptimes
        ? previousUptimes.find(u => u.fingerprint === fingerprint)
        : undefined
      const uptime_valid = seenRunningCount >= this.uptimeMinimumRunningCount
      let uptime_days = uptime_valid ? 1 : 0
      if (previousUptime && uptime_valid) {
        uptime_days = previousUptime.uptime_days + 1
      }

      relayUptimes.push({
        fingerprint,
        validation_date,
        uptime_days,
        uptime_valid,
        seen_running_timestamps: relayDatas
          .filter(({ running }) => running)
          .map(({ validated_at }) => validated_at),
        seen_not_running_timestamps: relayDatas
          .filter(({ running }) => !running)
          .map(({ validated_at }) => validated_at)
      })
    }

    this.logger.log(
      `Saving ${relayUptimes.length} RelayUptime reports for ${validation_date}`
    )

    await this.relayUptimeModel.insertMany(relayUptimes)

    this.logger.log(
      `Populated ${relayUptimes.length} RelayUptime reports for ${validation_date}`
    )
  }
}
