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
                ]),
                MongooseModule.forFeature([
                    { name: RelayData.name, schema: RelayDataSchema },
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
})
