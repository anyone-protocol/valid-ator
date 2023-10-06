import { Test, TestingModule } from '@nestjs/testing'
import { EventsService } from './events.service'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'

describe('EventsService', () => {
    let service: EventsService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                BullModule.registerQueue({
                    name: 'facilitator-updates-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerFlowProducer({
                    name: 'facilitator-updates-flow',
                    connection: { host: 'localhost', port: 6379 },
                }),
            ],
            providers: [EventsService],
        }).compile()

        service = module.get<EventsService>(EventsService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    it.todo('should flag for retry failed updateAllocation transactions.')
    it.todo('should skip retrying invalid updateAllocation transactions.')
    it.todo('should warn about problematic updateAllocation transactions.')
    it.todo('should provide error info with updates that are locked out')
    it.todo('should maintain events continuity between reboots')
})
