import { ConfigModule } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Test, TestingModule } from '@nestjs/testing'
import { Model, Types } from 'mongoose'

import { UptimeValidationService } from './uptime-validation.service'
import { RelayData } from './schemas/relay-data'
import { RelayUptime } from './schemas/relay-uptime'

describe('UptimeValidationService', () => {
  let module: TestingModule
  let service: UptimeValidationService
  let mockRelayDataModel: Model<RelayData>
  let mockRelayUptimeModel: Model<RelayUptime>

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ ConfigModule.forRoot() ],
      providers: [
        UptimeValidationService,
        {
          provide: getModelToken(RelayData.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
            insertMany: jest.fn()
          }
        },
        {
          provide: getModelToken(RelayUptime.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
            insertMany: jest.fn()
          }
        }
      ]
    }).compile()
    mockRelayDataModel = module.get<Model<RelayData>>(
      getModelToken(RelayData.name)
    )
    mockRelayUptimeModel = module.get<Model<RelayUptime>>(
      getModelToken(RelayUptime.name)
    )
    service = module.get<UptimeValidationService>(UptimeValidationService)
  })

  afterEach(async () => {
    if (module) {
      await module.close()
    }
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('Populating Relay Uptimes', () => {
    it('should populate uptime for new relays', async () => {
      const validation_date = '2024-08-07'
      const validated_at = new Date(validation_date).setHours(1)
      const fingerprintA = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const fingerprintB = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      const relayDataFindResults = [
        {
          fingerprint: fingerprintB,
          validated_at,
          running: false
        }
      ]
      const relayUptimes: RelayUptime[] = [
        {
          fingerprint: fingerprintB,
          validation_date,
          uptime_days: 0,
          uptime_valid: false,
          seen_running_timestamps: [],
          seen_not_running_timestamps: [ validated_at ]
        },
        {
          fingerprint: fingerprintA,
          validation_date,
          uptime_days: 1,
          uptime_valid: true,
          seen_running_timestamps: [],
          seen_not_running_timestamps: []
        }
      ]
      for (let i = 0; i < 16; i++) {
        let next_validated_at = validated_at + (60*60*1000*i)
        relayDataFindResults.push({
          fingerprint: fingerprintA,
          validated_at: next_validated_at,
          running: true
        })
        relayUptimes[1].seen_running_timestamps.push(next_validated_at)
      }

      jest
        .spyOn(mockRelayDataModel, 'find')
        .mockResolvedValue(relayDataFindResults as any)
      jest
        .spyOn(mockRelayUptimeModel, 'find')
        .mockResolvedValue([])
      const relayUptimeModelInsertManySpy = jest
        .spyOn(mockRelayUptimeModel, 'insertMany')
        .mockResolvedValue(relayUptimes as any)

      await service.populateRelayUptimesForDate(validation_date)

      expect(relayUptimeModelInsertManySpy).toHaveBeenCalledTimes(1)
      expect(relayUptimeModelInsertManySpy).toHaveBeenCalledWith(relayUptimes)
    })

    it('should populate uptime for seen relays', async () => {
      const prev_validation_date = '2024-08-06'
      const validation_date = '2024-08-07'
      const validated_at = new Date(validation_date).setHours(1)
      const fingerprintA = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const fingerprintB = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      const relayDataFindResults = [
        {
          fingerprint: fingerprintB,
          validated_at,
          running: false
        }
      ]
      const relayUptimes: RelayUptime[] = [
        {
          fingerprint: fingerprintB,
          validation_date,
          uptime_days: 0,
          uptime_valid: false,
          seen_running_timestamps: [],
          seen_not_running_timestamps: [ validated_at ]
        },
        {
          fingerprint: fingerprintA,
          validation_date,
          uptime_days: 7,
          uptime_valid: true,
          seen_running_timestamps: [],
          seen_not_running_timestamps: []
        }
      ]
      for (let i = 0; i < 16; i++) {
        let next_validated_at = validated_at + (60*60*1000*i)
        relayDataFindResults.push({
          fingerprint: fingerprintA,
          validated_at: next_validated_at,
          running: true
        })
        relayUptimes[1].seen_running_timestamps.push(next_validated_at)
      }

      jest
        .spyOn(mockRelayDataModel, 'find')
        .mockResolvedValue(relayDataFindResults as any)
      jest
        .spyOn(mockRelayUptimeModel, 'find')
        .mockResolvedValue([
          {
            fingerprint: fingerprintA,
            validation_date: prev_validation_date,
            uptime_days: 6,
            uptime_valid: true,
            seen_running_timestamps: [],
            seen_not_running_timestamps: []
          },
          {
            fingerprint: fingerprintB,
            validation_date: prev_validation_date,
            uptime_days: 0,
            uptime_valid: false,
            seen_running_timestamps: [],
            seen_not_running_timestamps: []
          }
        ])
      const relayUptimeModelInsertManySpy = jest
        .spyOn(mockRelayUptimeModel, 'insertMany')
        .mockResolvedValue(relayUptimes as any)

      await service.populateRelayUptimesForDate(validation_date)

      expect(relayUptimeModelInsertManySpy).toHaveBeenCalledTimes(1)
      expect(relayUptimeModelInsertManySpy).toHaveBeenCalledWith(relayUptimes)
    })
  })
})
