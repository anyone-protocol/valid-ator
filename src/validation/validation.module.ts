import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ValidationService as ValidationService } from './validation.service'
import { MongooseModule } from '@nestjs/mongoose'
import { RelayData, RelayDataSchema } from './schemas/relay-data'
import { ConfigService } from '@nestjs/config'
import { ValidationData, ValidationDataSchema } from './schemas/validation-data'
import { UptimeValidationService } from './uptime-validation.service'
import { RelayUptime } from './schemas/relay-uptime'

@Module({
    imports: [
        HttpModule.registerAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{
                    ONIONOO_REQUEST_TIMEOUT: number
                    ONIONOO_REQUEST_MAX_REDIRECTS: number
                    UPTIME_SEEN_COUNT_THRESHOLD: number
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
            { name: RelayData.name, schema: RelayDataSchema },
            { name: ValidationData.name, schema: ValidationDataSchema },
            { name: RelayUptime.name, schema: RelayDataSchema }
        ]),
    ],
    providers: [UptimeValidationService, ValidationService],
    exports: [ValidationService],
})
export class ValidationModule {}
