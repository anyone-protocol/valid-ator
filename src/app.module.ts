import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TasksModule } from './tasks/tasks.module'
import { OnionooModule } from './onionoo/onionoo.module'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        TasksModule,
        OnionooModule,
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRootAsync({
            inject: [ConfigService<{ MONGO_URI: string }>],
            useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGO_URI', { infer: true }) })
        }),
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
