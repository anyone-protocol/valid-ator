import { Test, TestingModule } from '@nestjs/testing'
import { VerificationService } from './verification.service'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import {
    VerificationData,
    VerificationDataSchema,
} from './schemas/verification-data'
import {
    VerifiedHardware,
    VerifiedHardwareSchema
} from './schemas/verified-hardware'

describe('VerificationService', () => {
    let service: VerificationService

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                MongooseModule.forRoot(
                    'mongodb://localhost/validator-validation-service-tests',
                ),
                MongooseModule.forFeature([
                    {
                        name: VerificationData.name,
                        schema: VerificationDataSchema,
                    },
                    {
                        name: VerifiedHardware.name,
                        schema: VerifiedHardwareSchema
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

    it('should validate hardware serial proofs', async () => {
        const nodeId = 'relay'
        const nftId = 0
        const deviceSerial = 'c2eeefaa42a50073'
        const atecSerial = '01237da6e721fcee01'
        const fingerprint = '6CF7AA4F7C8DABCF523DC1484020906C0E0F7A9C'
        const address = '01FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF02'
        const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
        const signature = 'e84dad1da3bbc25e60d3e54676ad1610172a2239bb571db9031dd8ca1973c4bab68b23f9a94ecab9396433499333963889f4ebcce79e3f219dab93956b4719ef'

        const result = await service.verifyRelaySerial(
            nodeId,
            nftId,
            deviceSerial,
            atecSerial,
            fingerprint,
            address,
            publicKey,
            signature
        )

        expect(result).toBe(true)
    })

    // Skipped tests are part of implemented spec, but skipped for now as expensive testing of logs/e2e

    it.skip('should attempt to retry failed relay metrics upload', () => {})
    it.skip('should attempt to retry failed stats data upload', () => {})

    it.skip('should warn about relay uploads that are locked', () => {})
    it.skip('should warn about stats uploads that are locked', () => {})

    it.skip('should maintain events continuity between reboots', () => {})
    it.skip('should warn about account funds depleting within a month', () => {})

    it.skip('should warn about failed verification jobs', () => {})

    // it('should check if the fingerprint was verified', async () => {
    //     expect(
    //         await service.verifyRelay({
    //             fingerprint: '80091027A368B886658AA0A89A75FBDE0BF7A5BC',
    //             ator_address: '0xCd5D478686c6fA5E47Fc457F16E04224cD012690',
    //             consensus_weight: 1,
    //             consensus_weight_fraction: 0,
    //             observed_bandwidth: 1,
    //             running: true,
    //         }),
    //     ).toBe('AlreadyVerified')
    // }, 60000)

    // it('should populate claims with relay fingerprints', async () => {
    //     expect(
    //         await service.verifyRelay({
    //             fingerprint: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    //             ator_address: '0x32c4e3A20c3fb085B4725fcF9303A450e750602A',
    //             consensus_weight: 1,
    //             consensus_weight_fraction: 0,
    //             observed_bandwidth: 1,
    //             running: true,
    //     }),
    //     ).toBe('OK')
    // }, 60000)

    // it('should check if the fingerprint was registered', async () => {
    //     expect(
    //         await service.verifyRelay({
    //             fingerprint: 'AABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    //             ator_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    //             consensus_weight: 1,
    //             consensus_weight_fraction: 0,
    //             observed_bandwidth: 1,
    //             running: true,
    //         }),
    //     ).toBe('NotRegistered')
    // }, 60000)
})
