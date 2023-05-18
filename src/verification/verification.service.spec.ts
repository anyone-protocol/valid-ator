import { Test, TestingModule } from '@nestjs/testing'
import { VerificationService } from './verification.service'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import {
    VerificationData,
    VerificationDataSchema,
} from './schemas/verification-data'

describe('VerificationService', () => {
    let service: VerificationService

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                MongooseModule.forRoot(
                    'mongodb://localhost/validATOR-onionoo-service-tests',
                ),
                MongooseModule.forFeature([
                    {
                        name: VerificationData.name,
                        schema: VerificationDataSchema,
                    },
                ]),
            ],
            providers: [VerificationService],
        }).compile()

        service = module.get<VerificationService>(VerificationService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    it('should check if the fingerprint was registered', async () => {
        expect(
            await service.verifyRelay({
                fingerprint: 'AABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
                ator_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                consensus_weight: 1,
                observed_bandwidth: 1,
                running: true,
            }),
        ).toBe('NotRegistered')
    }, 60000)

    it('should check if the fingerprint was verified', async () => {
        expect(
            await service.verifyRelay({
                fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                ator_address: '0x32c4e3A20c3fb085B4725fcF9303A450e750602A',
                consensus_weight: 1,
                observed_bandwidth: 1,
                running: true,
            }),
        ).toBe('AlreadyVerified')
    }, 60000)

    // it('should allow verifying relay fingerprints', async () => {
    //     expect(
    //         await service.verifyRelay({
    //             fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    //             ator_public_key: '0x32c4e3A20c3fb085B4725fcF9303A450e750602A',
    //             consensus_weight: 1,
    //             observed_bandwidth: 1,
    //             running: true,
    //     }),
    //     ).toBe('OK')
    // }, 60000)
})
