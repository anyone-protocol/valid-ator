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
                    'mongodb://localhost/validator-validation-service-tests',
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

    fit('should validate hardware serial proofs', async () => {
        const cpuId = 'HWrelay'
        const atecId = '0123d4fb782ded6101'
        const fingerprint = '56F803E581C66B80FC2253DD065A3F618F7E95F4'
        const address = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'

        // const signature = [
        //     0x66, AF, 46, 70, 73, 23, A2, BD, 1C, 55, F4, C1, AF, 84, 17, 36, 23, 21, 69, 34, 3C, 31, 50,
        //     C8, AF, 9C, 41, BD, 
        // ]

        const tbsDigest = new Uint8Array([
            0x48, 0x57, 0x72, 0x65, 0x6C, 0x61, 0x79, 0xC2, 0xEE, 0xEF, 0xAA, 0x42, 0xA5, 0x00, 0x73, 0x01,
            0x23, 0xD4, 0xFB, 0x78, 0x2D, 0xED, 0x61, 0x01, 0x56, 0xF8, 0x03, 0xE5, 0x81, 0xC6, 0x6B, 0x80,
            0xFC, 0x22, 0x53, 0xDD, 0x06, 0x5A, 0x3F, 0x61, 0x8F, 0x7E, 0x95, 0xF4, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
        ])

        const signature = new Uint8Array([
            0xEE, 0x4C, 0x00, 0x6A, 0xF8, 0x5B, 0x35, 0x95, 0x8F, 0x56, 0x3D, 0xFB, 0xC5, 0xC3, 0x86, 0x08,
            0x80, 0x4B, 0x0A, 0xAE, 0xBF, 0xC9, 0xDF, 0x86, 0x82, 0xA5, 0xB6, 0xB1, 0x79, 0x28, 0x89, 0xA1,
            0x07, 0x9F, 0x05, 0x56, 0x17, 0xA6, 0x1C, 0xB3, 0xE0, 0x5E, 0x8E, 0x41, 0xCC, 0x51, 0x80, 0x92,
            0x4A, 0x9B, 0xB5, 0x75, 0x08, 0xD1, 0x73, 0x76, 0x1D, 0xAE, 0x14, 0x85, 0x3D, 0xF7, 0x23, 0xDC
        ])

        const publicKey = new Uint8Array([
            0x3A, 0x4A, 0x8D, 0xEB, 0xB4, 0x86, 0xD3, 0x2D, 0x43, 0x8F, 0x38, 0xCF, 0x24, 0xF8, 0xB7, 0x23,
            0x32, 0x6F, 0xB8, 0x5C, 0xF9, 0xC1, 0x5A, 0x2A, 0x7F, 0x9B, 0xC8, 0x09, 0x16, 0xDD, 0x8D, 0x7D,
            0xE8, 0xB9, 0x99, 0x0A, 0x8F, 0xC0, 0xA1, 0x2E, 0x72, 0xFD, 0x99, 0x0B, 0x35, 0x69, 0xBB, 0xBF,
            0x24, 0x97, 0x0B, 0x07, 0xA0, 0x24, 0xA0, 0x3F, 0xA5, 0x1E, 0x5B, 0x71, 0x9F, 0xE9, 0x21, 0xBF
        ])

        const signatureBase64 =
            '7kwAavhbNZWPVj37xcOGCIBLCq6/yd+GgqW2sXkoiaEHnwVWF6Ycs+BejkHMUYCSSpu1dQjRc3YdrhSFPfcj3A=='

        const result = await service.verifyRelaySerial(
            tbsDigest,
            signature,
            publicKey
            // cpuId,
            // atecId,
            // fingerprint,
            // address
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
