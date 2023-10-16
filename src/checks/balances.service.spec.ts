import { Test, TestingModule } from '@nestjs/testing'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { BalancesService } from './balances.service'
import { BalancesData, BalancesDataSchema } from './schemas/balances-data'

describe('BalancesService', () => {
    let service: BalancesService

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                MongooseModule.forRoot(
                    'mongodb://localhost/validATOR-balances-service-tests',
                ),
                MongooseModule.forFeature([
                    {
                        name: BalancesData.name,
                        schema: BalancesDataSchema,
                    },
                ]),
            ],
            providers: [BalancesService],
        }).compile()

        service = module.get<BalancesService>(BalancesService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })
})
