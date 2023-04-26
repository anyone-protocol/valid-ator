import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { OnionooService } from './onionoo.service'
import { MongooseModule } from '@nestjs/mongoose'
import { RelayData, RelayDataSchema } from './schemas/relay-data'
import {
    OnionooServiceData,
    OnionooServiceDataSchema,
} from './schemas/onionoo-service-data'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
    imports: [
        HttpModule.registerAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{
                    ONIONOO_REQUEST_TIMEOUT: number
                    ONIONOO_REQUEST_MAX_REDIRECTS: number
                }>,
            ) => ({
                timeout: config.get<number>('ONIONOO_REQUEST_TIMEOUT', {
                    infer: true,
                }),
                maxRedirects: config.get<number>(
                    'ONIONOO_REQUEST_MAX_REDIRECTS',
                    { infer: true },
                ),
            }),
        }),
        MongooseModule.forFeature([
            { name: OnionooServiceData.name, schema: OnionooServiceDataSchema },
            { name: RelayData.name, schema: RelayDataSchema },
        ]),
    ],
    providers: [OnionooService],
    exports: [OnionooService],
})
export class OnionooModule {}
