import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { HttpModule } from '@nestjs/axios'

import { VerificationService } from './verification.service'
import {
    VerificationData,
    VerificationDataSchema,
} from './schemas/verification-data'
import {
    VerifiedHardware,
    VerifiedHardwareSchema
} from './schemas/verified-hardware'


@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: VerificationData.name, schema: VerificationDataSchema },
            { name: VerifiedHardware.name, schema: VerifiedHardwareSchema },
        ]),
        HttpModule.registerAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{
                    DRE_REQUEST_TIMEOUT: number
                    DRE_REQUEST_MAX_REDIRECTS: number
                }>,
            ) => ({
                timeout: config.get<number>('DRE_REQUEST_TIMEOUT', {
                    infer: true,
                }),
                maxRedirects: config.get<number>(
                    'DRE_REQUEST_MAX_REDIRECTS',
                    { infer: true },
                ),
            }),
        })
    ],
    providers: [VerificationService],
    exports: [VerificationService],
})
export class VerificationModule {}
