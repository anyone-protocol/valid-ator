import cluster from 'node:cluster'
import * as os from 'os'
import { Injectable } from '@nestjs/common'

const maxCPUs = os.cpus().length

@Injectable()
export class AppThreadsService {
    static localLeaderPid: number = -1 // no local leader elected by default

    static electLocalLeader(): void {
        if (cluster.workers !== undefined) {
            let workers = Object.values(cluster.workers)
            let availablePids = workers
                .map(worker => worker?.process.pid)
                .filter((pid, index) => (pid !== undefined) && (index !== this.localLeaderPid))
            
            if (availablePids.length > 0) {
                const leaderIndex = 0 // First one among excluded
                const leader = workers.find(w => w?.process.pid == availablePids[leaderIndex])
                AppThreadsService.localLeaderPid = leader?.process.pid || -1
            } else {
                console.error('No local candidates available to be elected as leaders.')
                AppThreadsService.localLeaderPid = -1
            }
        } else {
            console.error('No worker threads registered!')
            AppThreadsService.localLeaderPid = -1
        }
    }

    static parallelize(callback: Function): void {
        if (cluster.isPrimary) {
            const countCPUs = parseInt(process.env.CPU_COUNT || '1')
            const numThreads = Math.min(countCPUs, maxCPUs)
            console.log(
                `Primary process pid: ${process.pid}, forking ${numThreads} threads`,
            )

            if (numThreads > 0) {
                for (let i = 0; i < numThreads; i++) {
                    cluster.fork()
                }

                cluster.on('exit', (worker, code, signal) => {
                    if (worker.process.pid === AppThreadsService.localLeaderPid) {
                        AppThreadsService.electLocalLeader()
                    }
                    console.log(
                        `Worker ${worker.process.pid} died. Restarting...`,
                    )
                    cluster.fork()
                })

                AppThreadsService.electLocalLeader()
            } else {
                console.log(
                    `Skipping parallelization... Process pid ${process.pid}`,
                )
                callback()
            }
        } else if (cluster.isWorker) {
            console.log(`Worker process pid ${process.pid}`)
            callback()
        }
    }
}
