import { Module } from '@nestjs/common'
import { VerificationService } from './verification.service'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import {
    VerificationData,
    VerificationDataSchema,
} from './schemas/verification-data'
import {
    VerifiedHardware,
    VerifiedHardwareSchema
} from './schemas/verified-hardware'
import { HttpModule } from '@nestjs/axios'

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
        }),
    ],
    providers: [VerificationService],
    exports: [VerificationService],
})
export class VerificationModule {}
