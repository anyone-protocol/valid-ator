import { Module } from '@nestjs/common'
import { VerificationService } from './verification.service'
import { ConfigModule } from '@nestjs/config'

@Module({
    imports: [ConfigModule],
    providers: [VerificationService],
    exports: [VerificationService],
})
export class VerificationModule {}
