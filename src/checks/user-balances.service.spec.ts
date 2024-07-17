import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'

import { UserBalancesService } from './user-balances.service'

describe('UserBalancesService', () => {
  let service: UserBalancesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
      ],
      providers: [UserBalancesService],
    }).compile()

    service = module.get<UserBalancesService>(UserBalancesService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
