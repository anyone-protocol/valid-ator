import { Module } from '@nestjs/common'
import { DistributionService } from './distribution.service'
import { HttpModule } from '@nestjs/axios'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
    imports: [
        ConfigModule,
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
    providers: [DistributionService],
    exports: [DistributionService],
})
export class DistributionModule {}
