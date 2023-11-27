import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TasksModule } from './tasks/tasks.module'
import { ValidationModule } from './validation/validation.module'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { VerificationModule } from './verification/verification.module'
import { EventsModule } from './events/events.module'
import { DistributionModule } from './distribution/distribution.module'
import { BullModule } from '@nestjs/bullmq'
import { ChecksModule } from './checks/checks.module'
import { ClusterModule } from './cluster/cluster.module'
import { AppThreadsService } from './app-threads.service'

@Module({
    imports: [
        TasksModule,
        ValidationModule,
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({
            inject: [ConfigService<{ MONGO_URI: string }>],
            useFactory: (config: ConfigService) => ({
                uri: config.get<string>('MONGO_URI', { infer: true }),
            }),
        }),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<{
                    REDIS_HOSTNAME: string
                    REDIS_PORT: number
                }>,
            ) => ({
                connection: {
                    host: config.get<string>('REDIS_HOSTNAME', { infer: true }),
                    port: config.get<number>('REDIS_PORT', { infer: true }),
                },
            }),
        }),
        VerificationModule,
        EventsModule,
        DistributionModule,
        ChecksModule,
        ClusterModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
