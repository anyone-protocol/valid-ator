import { Test, TestingModule } from '@nestjs/testing'
import { DistributionService } from './distribution.service'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

describe('DistributionService', () => {
    let service: DistributionService
    let testModule: TestingModule

    beforeAll(async () => {
        testModule = await Test.createTestingModule({
            imports: [ConfigModule.forRoot()],
            providers: [DistributionService],
        }).compile()

        service = testModule.get<DistributionService>(DistributionService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    // Skipped tests are part of implemented spec, but skipped for now as expensive testing of logs/e2e
    it.skip('should attempt to retry failed transactions for a distribution.', () => {})
    it.skip(
        'should not finalize the distribution until all transactions succeed.', () => {}
    )
    it.skip('should warn about distributions that are locked', () => {})
    it.skip('should warn about account funds depleting within a month', () => {})
    it.skip('should maintain distribution continuity between reboots', () => {})
    it.skip('should maintain distribution rhythm between reboots', () => {})
})
