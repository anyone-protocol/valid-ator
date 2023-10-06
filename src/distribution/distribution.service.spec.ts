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

    it.todo('should attempt to retry failed transactions for a distribution.')
    it.todo(
        'should not finalize the distribution until all transactions succeed.',
    )
    it.todo('should warn about distributions that are locked')
    it.todo('should warn about account funds depleting within a month')
    it.todo('should maintain distribution continuity between reboots')
    it.todo('should maintain distribution rhythm between reboots')
})
