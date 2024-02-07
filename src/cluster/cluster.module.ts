import { Module } from '@nestjs/common'
import { ClusterService } from './cluster.service'
import { AppThreadsService } from './app-threads.service'

@Module({
    providers: [ClusterService, AppThreadsService],
    exports: [ClusterService],
})
export class ClusterModule {}
