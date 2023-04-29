import { Module } from '@nestjs/common'
import { ContractsService } from './contracts.service'
import { ConfigModule } from '@nestjs/config'

@Module({
    imports: [ConfigModule],
    providers: [ContractsService],
    exports: [ContractsService],
})
export class ContractsModule {}
