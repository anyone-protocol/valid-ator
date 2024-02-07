import { Test, TestingModule } from '@nestjs/testing'
import { EventsService } from './events.service'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { ClusterModule } from '../cluster/cluster.module'

describe('EventsService', () => {
    let service: EventsService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                ClusterModule,
                BullModule.registerQueue({
                    name: 'facilitator-updates-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerFlowProducer({
                    name: 'facilitator-updates-flow',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerQueue({
                    name: 'registrator-updates-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerFlowProducer({
                    name: 'registrator-updates-flow',
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

    // Skipped tests are part of implemented spec, but skipped for now as expensive testing of logs/e2e
    it.skip('should store registration locks in relay-registry.', () => {})

    it.skip('should flag for retry failed updateAllocation transactions.', () => {})
    it.skip('should skip retrying invalid updateAllocation transactions.', () => {})
    it.skip('should warn about problematic updateAllocation transactions.', () => {})
    it.skip('should provide error info with updates that are locked out', () => {})
    it.skip('should maintain events continuity between reboots', () => {})
    it.skip('should warn about operational token balance', () => {})
    it.skip('should warn about main token balance', () => {})
})
