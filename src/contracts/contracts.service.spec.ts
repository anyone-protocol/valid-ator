import { Test, TestingModule } from '@nestjs/testing'
import { ContractsService } from './contracts.service'
import { ConfigModule } from '@nestjs/config'

describe('ContractsService', () => {
    let service: ContractsService

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule.forRoot()],
            providers: [ContractsService],
        }).compile()

        service = module.get<ContractsService>(ContractsService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    it('should check if the fingerprint was registered', async () => {
        expect(
            await service.verifyRelay({
                fingerprint: 'AABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
                ator_public_key: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            }),
        ).toBe('NotRegistered')
    })

    it('should check if the fingerprint was verified', async () => {
        expect(
            await service.verifyRelay({
                fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                ator_public_key: '0x32c4e3A20c3fb085B4725fcF9303A450e750602A',
            }),
        ).toBe('AlreadyVerified')
    })

    // it('should allow registering relay fingerprints', async () => {
    //     expect(
    //         await service.verifyRelay({
    //             fingerprint: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    //             ator_public_key: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
    //     }),
    //     ).toBe(RelayVerificationResult.AlreadyVerified)
    // })
})
