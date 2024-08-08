import { Test, TestingModule } from '@nestjs/testing'
import { HttpModule } from '@nestjs/axios'
import { getModelToken } from '@nestjs/mongoose'
import { ConfigModule } from '@nestjs/config'
import { Model } from 'mongoose'

import { ValidationService } from './validation.service'
import { RelayData, RelayDataSchema } from './schemas/relay-data'
import { ValidationData, ValidationDataSchema } from './schemas/validation-data'
import { RelayDataDto } from './dto/relay-data-dto'

describe('ValidationService', () => {
    let module: TestingModule
    let service: ValidationService

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot(),
                HttpModule.register({ timeout: 60 * 1000, maxRedirects: 3 }),
            ],
            providers: [
                ValidationService,
                {
                    provide: getModelToken(RelayData.name),
                    useValue: Model
                },
                {
                    provide: getModelToken(ValidationData.name),
                    useValue: Model
                }
            ],
        }).compile()

        service = module.get<ValidationService>(ValidationService)
    })

    afterAll(async () => {
        if (module) {
            await module.close()
        }
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    it('should extract ator key when not padded', () => {
        expect(
            service.extractAtorKey(
                'Some @text @anon:0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when padded', () => {
        expect(
            service.extractAtorKey(
                'Some @text @anon:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when alone', () => {
        expect(
            service.extractAtorKey(
                '@anon:0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when alone padded', () => {
        expect(
            service.extractAtorKey(
                '@anon: 0xf72a247Dc4546b0291dbbf57648D45a752537802',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key when spammed but not reusing keyword', () => {
        expect(
            service.extractAtorKey(
                '@anon@anon:	 	 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3 @anon',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should extract ator key from first keyword when spammed', () => {
        expect(
            service.extractAtorKey(
                '@anon@anon:	 	 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3 @anon:0x0000000000000000000000000000000000000000',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should fail extracting ator key when invalid keyword', () => {
        expect(
            service.extractAtorKey(
                '@anon@anon; 0xf72a247Dc4546b0291dbbf57648D45a752537802  kpaojak9oo3',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when the line is cut', () => {
        expect(
            service.extractAtorKey(
                '@anon@anon: 0xf72a247Dc4546b0291dbbf57648D45a75253780',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when invalid checksum in key', () => {
        expect(
            service.extractAtorKey(
                '@anon: 0x8Ba1f109551bD432803012645Ac136ddd64DBa72',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key when invalid characters in key', () => {
        expect(
            service.extractAtorKey(
                '@anon: 0xZY*!"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            ),
        ).toEqual('')
    })

    it('should fail extracting ator key on invalid checksum', () => {
        expect(
            service.extractAtorKey(
                '@anon: 0xf72a247dc4546b0291Dbbf57648d45a752537802',
            ),
        ).toEqual('')
    })

    it('should add a checksum to a correct ator address without one', () => {
        expect(
            service.extractAtorKey(
                '@anon@anon:	 	 0xf72a247dc4546b0291dbbf57648d45a752537802  kpaojak9oo3 @anon:0x0000000000000000000000000000000000000000',
            ),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it('should filter relays only to ones matching the pattern', async () => {
        const relay1 = {
            nickname: 'nick-1',
            fingerprint: 'F143E45414700000000000000000000000000001',
            contact: 'some random @text',
            or_addresses: [ '127.0.0.1:42069' ],
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
                'Some @text @anon:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            or_addresses: [ '127.0.0.1:42069' ],
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
                consensus_weight: 1,
                effective_family: [],
                running: true,
                consensus_measured: false,
                consensus_weight_fraction: 0,
                version: '?',
                version_status: '',
                bandwidth_rate: 0,
                bandwidth_burst: 0,
                observed_bandwidth: 0,
                advertised_bandwidth: 0,
                hardware_info: undefined,
                last_seen: '',
                nickname: 'nick-2',
                primary_address_hex: '?'
            },
        ])
    })

    it.skip('should persist new validated relays', async () => {
        const relayDto1: RelayDataDto = {
            fingerprint: 'F143E45414700000000000000000000000000010',
            nickname: 'mock-validated-relay',
            contact:
                'Some @text @anon:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            consensus_weight: 1,
            primary_address_hex: '0xf72a247Dc4546b0291dbbf57648D45a752537802',
            running: false,
            consensus_measured: false,
            consensus_weight_fraction: 0,
            version: '',
            version_status: '',
            bandwidth_rate: 0,
            bandwidth_burst: 0,
            observed_bandwidth: 0,
            advertised_bandwidth: 0,
            effective_family: []
        }

        service.validateRelays([relayDto1])

        expect(
            await service
                .lastValidationOf(relayDto1.fingerprint)
                .then((value) => value?.ator_address),
        ).toEqual('0xf72a247Dc4546b0291dbbf57648D45a752537802')
    })

    it.skip('should filter out incorrect ator keys during validation', async () => {
        const relayDto2: RelayDataDto = {
            fingerprint: 'F143E45414700000000000000000000000000020',
            nickname: 'mock-validated-relay',
            contact:
                'Some @text @anon:  0xf72a247dc4546b0291dbbf57648D45a752537802',
            consensus_weight: 1,
            primary_address_hex: '0xf72a247Dc4546b0291dbbf57648D45a752537802',
            running: false,
            consensus_measured: false,
            consensus_weight_fraction: 0,
            version: '',
            version_status: '',
            bandwidth_rate: 0,
            bandwidth_burst: 0,
            observed_bandwidth: 0,
            advertised_bandwidth: 0,
            effective_family: []
        }

        service.validateRelays([relayDto2])
        expect(await service.lastValidationOf(relayDto2.fingerprint)).toEqual(
            null,
        )
    })

    it.skip('should provide last validation results', async () => {
        const relayDto1: RelayDataDto= {
            fingerprint: 'F143E45414700000000000000000000000000010',
            nickname: 'mock-validated-relay',
            contact:
                'Some @text @anon:  0xf72a247Dc4546b0291dbbf57648D45a752537802',
            consensus_weight: 1,
            primary_address_hex: '0xf72a247Dc4546b0291dbbf57648D45a752537802',
            running: false,
            consensus_measured: false,
            consensus_weight_fraction: 0,
            version: '',
            version_status: '',
            bandwidth_rate: 0,
            bandwidth_burst: 0,
            observed_bandwidth: 0,
            advertised_bandwidth: 0,
            effective_family: []
        }

        service.validateRelays([relayDto1])

        expect(
            await service
                .lastValidation()
                .then((value) => value?.relays.length),
        ).toEqual(1)
    })
})
