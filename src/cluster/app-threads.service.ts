import cluster from 'node:cluster'
import * as os from 'os'
import { Injectable } from '@nestjs/common'

const maxCPUs = os.cpus().length

@Injectable()
export class AppThreadsService {

    static createLeaderAwareWorker(isLocalLeader: boolean): void {
        cluster.fork({ 'IS_LOCAL_LEADER': isLocalLeader })
    }

    static parallelize(callback: Function): void {
        if (cluster.isPrimary) {
            const countCPUs = parseInt(process.env.CPU_COUNT || '1')
            const numThreads = Math.min(countCPUs, maxCPUs)
            console.log(
                `Primary process pid: ${process.pid}, forking ${numThreads} threads`,
            )

            if (numThreads > 1) {
                for (let i = 0; i < numThreads; i++) {
                    AppThreadsService.createLeaderAwareWorker(i == 0)
                }
            } else {
                console.log(
                    `Skipping parallelization... Process pid ${process.pid}`,
                )
                process.env['IS_LOCAL_LEADER'] = 'true'
                callback()
            }
        } else if (cluster.isWorker) {
            callback()
        }
    }
}
