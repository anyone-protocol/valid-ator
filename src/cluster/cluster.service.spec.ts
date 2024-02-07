import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { ClusterService } from './cluster.service'
import { AppThreadsService } from './app-threads.service'

describe('ClusterService', () => {
    let service: ClusterService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
            ],
            providers: [ClusterService],
        }).compile()

        service = module.get<ClusterService>(ClusterService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
