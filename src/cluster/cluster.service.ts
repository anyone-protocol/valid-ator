import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Consul from 'consul'

@Injectable()
export class ClusterService implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly logger = new Logger(ClusterService.name)

    private isLive?: string

    private consulToken?: string

    private isLeader?: boolean
    private bootstrapExpect?: number
    
    private nodeList = []

    private consul?: Consul.Consul

    constructor(
        private readonly config: ConfigService<{
            CONSUL_HOST: string
            CONSUL_PORT: number
            CONSUL_TOKEN: string
            BOOTSTRAP_EXPECT: string
            IS_LIVE: string
        }>,
    ) {
        this.isLive = this.config.get<string>('IS_LIVE', { infer: true })

        this.bootstrapExpect = this.config.get<number>('BOOTSTRAP_EXPECT', { infer: true })
        this.consulToken = this.config.get<string>('CONSUL_TOKEN', { infer: true })

        const host = this.config.get<string>('CONSUL_HOST', { infer: true }),
            port = this.config.get<number>('CONSUL_PORT', { infer: true })

        if (this.isLive === 'true') {
            if (host != undefined && port != undefined) {
                console.log(`Connecting to Consul at ${host}:${port}`)
                this.consul = new Consul({host, port})

                // initiate node discovery
            }
        } else {
            this.logger.warn('Not live, skipping consul based cluster data. Bootstrapping one node only...')
        }
    }

    async onApplicationBootstrap(): Promise<void> {
        
    }

    async beforeApplicationShutdown(): Promise<void> {
        
    }
}
