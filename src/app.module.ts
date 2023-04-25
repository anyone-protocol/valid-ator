import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TasksModule } from './tasks/tasks.module'
import { OnionooModule } from './onionoo/onionoo.module'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        TasksModule,
        OnionooModule,
        ConfigModule.forRoot(),
        MongooseModule.forRoot('mongodb://localhost/validATOR-dev'),
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
