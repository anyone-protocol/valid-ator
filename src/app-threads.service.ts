import cluster from 'node:cluster'
import * as os from 'os'
import { Injectable } from '@nestjs/common'

const maxCPUs = os.cpus().length

@Injectable()
export class AppThreadsService {
    static localLeaderIndex: number = -1 // no local leader elected by default

    static electLocalLeader(isSteppingDown: boolean): void {
        let availableIndexes = [...Array(cluster.workers?.length || 0).keys()]
        if (isSteppingDown && this.localLeaderIndex > -1) {
            availableIndexes.filter(
                (_value, index) => index === this.localLeaderIndex,
            )
        }
        this.localLeaderIndex = availableIndexes.length - 1
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
                this.electLocalLeader(false)

                cluster.on('exit', (worker, code, signal) => {
                    console.log(
                        `Worker ${worker.process.pid} died. Restarting...`,
                    )
                    cluster.fork()
                })
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
