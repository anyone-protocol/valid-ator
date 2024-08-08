import { Test, TestingModule } from '@nestjs/testing'
import { DistributionService } from './distribution.service'
import { ConfigModule } from '@nestjs/config'
import { HttpModule } from '@nestjs/axios'

describe('DistributionService', () => {
    let service: DistributionService
    let module: TestingModule

    beforeEach(async () => {
        module = await Test.createTestingModule({
            imports: [ ConfigModule.forRoot(), HttpModule ],
            providers: [ DistributionService ],
        }).compile()

        service = module.get<DistributionService>(DistributionService)
    })

    afterEach(async () => {
        if (module) {
            await module.close()
        }
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    // Skipped tests are part of implemented spec, but skipped for now as expensive testing of logs/e2e
    it.skip('should attempt to retry failed transactions for a distribution.', () => {})
    it.skip('should not finalize the distribution until all transactions succeed.', () => {})
    it.skip('should warn about distributions that are locked', () => {})
    it.skip('should warn about account funds depleting within a month', () => {})
    it.skip('should maintain distribution continuity between reboots', () => {})
    it.skip('should maintain distribution rhythm between reboots', () => {})
})
