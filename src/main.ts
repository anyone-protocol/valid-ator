import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { AppThreadsService } from './cluster/app-threads.service'

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log', 'debug'], // 'verbose'],
    })
    await app.listen(3000)
}
AppThreadsService.parallelize(bootstrap)
