import { Test, TestingModule } from '@nestjs/testing'
import { TasksService } from './tasks.service'
import { BullModule } from '@nestjs/bullmq'

describe('TasksService', () => {
    let service: TasksService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                BullModule.registerQueue({
                    name: 'tasks-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerQueue({
                    name: 'onionoo-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerQueue({
                    name: 'publishing-queue',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerFlowProducer({
                    name: 'validation-flow',
                    connection: { host: 'localhost', port: 6379 },
                }),
                BullModule.registerFlowProducer({
                    name: 'publishing-flow',
                    connection: { host: 'localhost', port: 6379 },
                }),
            ],
            providers: [TasksService],
        }).compile()

        service = module.get<TasksService>(TasksService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
