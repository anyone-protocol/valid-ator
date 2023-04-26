import { Test, TestingModule } from '@nestjs/testing'
import { OnionooService } from './onionoo.service'
import { HttpModule } from '@nestjs/axios'
import { MongooseModule } from '@nestjs/mongoose'
import {
    OnionooServiceData,
    OnionooServiceDataSchema,
} from './schemas/onionoo-service-data'
import { RelayData, RelayDataSchema } from './schemas/relay-data'
import { ConfigModule } from '@nestjs/config'
import { ValidationData, ValidationDataSchema } from './schemas/validation-data'

describe('OnionooService', () => {
    let testModule: TestingModule
    let service: OnionooService

    beforeAll(async () => {
        testModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                HttpModule.register({ timeout: 60 * 1000, maxRedirects: 3 }),
                MongooseModule.forRoot(
                    'mongodb://localhost/validATOR-onionoo-service-tests',
                ),

                MongooseModule.forFeature([
                    {
                        name: OnionooServiceData.name,
                        schema: OnionooServiceDataSchema,
                    },
                    { name: RelayData.name, schema: RelayDataSchema },
                    { name: ValidationData.name, schema: ValidationDataSchema },
                ]),
            ],
            providers: [OnionooService],
        }).compile()

        service = testModule.get<OnionooService>(OnionooService)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    it('should extract ator key when not padded', () => {
        expect(
            service.extractAtorKey(
                'Some @text @ator:0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when padded', () => {
        expect(
            service.extractAtorKey(
                'Some @text @ator:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when alone', () => {
        expect(
            service.extractAtorKey(
                '@ator:0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when alone padded', () => {
        expect(
            service.extractAtorKey(
                '@ator: 0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when spammed but not reusing keyword', () => {
        expect(
            service.extractAtorKey(
                '@ator@ator:	 	 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3 @ator',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key from first keyword when spammed', () => {
        expect(
            service.extractAtorKey(
                '@ator@ator:	 	 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3 @ator:0x0000000000000000000000000000000000000000',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should fail extracting ator key when invalid keyword', () => {
        expect(
            service.extractAtorKey(
                '@ator@ator; 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when the line is cut', () => {
        expect(
            service.extractAtorKey(
                '@ator@ator: 0xf72a247Dc4546b0291dbbf57648D45a75253780',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when invalid checksum in key', () => {
        expect(
            service.extractAtorKey(
                '@ator: 0x8Ba1f109551bD432803012645Ac136ddd64DBa72',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when invalid characters in key', () => {
        expect(
            service.extractAtorKey(
                '@ator: 0xZY*!"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key on invalid checksum', () => {
        expect(
            service.extractAtorKey(
                '@ator: 0xf72a247dc4546b0291Dbbf57648d45a752537802',
            ),
        ).toEqual('')
    })

    it('should add a checksum to a correct ator address without one', () => {
        expect(
            service.extractAtorKey(
                '@ator@ator:	 	 0xf72a247dc4546b0291dbbf57648d45a752537802  kpaojak9oo3 @ator:0x0000000000000000000000000000000000000000',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should filter relays only to ones matching the pattern', async () => {
        const relay1 = {
            nickname: 'nick-1',
            fingerprint: 'F143E45414700000000000000000000000000001',
            contact: 'some random @text',
            or_addresses: [],
            last_seen: '',
            last_changed_address_or_port: '',
            first_seen: '',
            running: true,
            consensus_weight: 1,
        }

        const relay2 = {
            nickname: 'nick-2',
            fingerprint: 'F143E45414700000000000000000000000000002',
            contact:
                'Some @text @ator:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            or_addresses: [],
            last_seen: '',
            last_changed_address_or_port: '',
            first_seen: '',
            running: true,
            consensus_weight: 1,
        }
        expect(await service.filterRelays([relay1, relay2])).toEqual([
            {
                contact: relay2.contact,
                fingerprint: relay2.fingerprint,
            },
        ])
    })

    it('should persist new validated relays', async () => {
        const relayDto1 = {
            fingerprint: 'F143E45414700000000000000000000000000010',
            contact:
                'Some @text @ator:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
        }

        service.validateRelays([relayDto1])

        expect(
            await service
                .lastValidationOf(relayDto1.fingerprint)
                .then((value) => value?.ator_public_key),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should filter out incorrect ator keys during validation', async () => {
        const relayDto2 = {
            fingerprint: 'F143E45414700000000000000000000000000020',
            contact:
                'Some @text @ator:  0xf72a247dc4546b0291dbbf57648D45a752537802',
        }

        service.validateRelays([relayDto2])
        expect(await service.lastValidationOf(relayDto2.fingerprint)).toEqual(
            null,
        )
    })
})
