import { Test, TestingModule } from '@nestjs/testing'
import { OnionooService } from './onionoo.service'

describe('OnionooService', () => {
    let service: OnionooService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [OnionooService],
        }).compile()

        service = module.get<OnionooService>(OnionooService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
