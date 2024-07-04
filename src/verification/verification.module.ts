import { Module } from '@nestjs/common'
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

@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: VerificationData.name, schema: VerificationDataSchema },
            { name: VerifiedHardware.name, schema: VerifiedHardwareSchema },
        ]),
    ],
    providers: [VerificationService],
    exports: [VerificationService],
})
export class VerificationModule {}
