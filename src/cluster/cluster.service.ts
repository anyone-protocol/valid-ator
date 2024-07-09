import {
    BeforeApplicationShutdown,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Consul from 'consul'
import {
    Append,
    AppendResult,
    Config,
    State,
    Vote,
    VoteResult,
} from './interfaces/raft-types'
import { AppThreadsService } from './app-threads.service'

@Injectable()
export class ClusterService
    implements OnApplicationBootstrap, BeforeApplicationShutdown
{
    private readonly logger = new Logger(ClusterService.name)

    // true - should receive and act on external events in sync with orchestrating the cluster (provide the source of truth for the raft's log)
    //      acting on events is linked with the Raft log, to assure all events are correctly processed
    // false - should receive external events, maintain the distributed Raft log and be ready to become a leader
    //      these nodes will also pick up jobs that get initiated by the leader distributing the load in the cluster
    // undefined - wait for leader resolution to finish
    public isLeader?: boolean

    public isLocalLeader(): boolean {
        let isLL = process.env['IS_LOCAL_LEADER']
        return (isLL != undefined && isLL == 'true')
    }

    public isTheOne(): boolean {
        const isLL = this.isLocalLeader()
        this.logger.debug(`is the one? isLeader: ${this.isLeader} isLocalLeader: ${isLL} - ${process.pid}`)
        return (
            this.isLeader != undefined &&
            this.isLeader == true &&
            isLL
        )
    }

    private isLive?: string

    private consulToken?: string

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

        const host = this.config.get<string>('CONSUL_HOST', { infer: true }),
            port = this.config.get<number>('CONSUL_PORT', { infer: true })

        if (this.isLive === 'true') {
            if (host != undefined && port != undefined) {
                this.bootstrapExpect = this.config.get<number>(
                    'BOOTSTRAP_EXPECT',
                    { infer: true },
                )
                this.consulToken = this.config.get<string>('CONSUL_TOKEN', {
                    infer: true,
                })

                console.log(`Connecting to Consul at ${host}:${port}`)
                this.consul = new Consul({ host, port })

                // initiate node discovery
            } else {
                this.logger.warn(
                    'Host/port of Consul not set, bootstrapping in single node mode...',
                )
                this.isLeader = true
            }
        } else {
            this.logger.warn(
                'Not live, skipping consul based cluster data. Bootstrapping in single node mode...',
            )
            this.isLeader = true
        }
    }

    async onApplicationBootstrap(): Promise<void> {}

    async beforeApplicationShutdown(): Promise<void> {}

    public requestVote(configuration: Config, rpc: Vote): VoteResult {
        // If the RPC term is less than the current term, return a response with voteGranted set to false
        if (rpc.term < configuration.currentTerm) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // If the RPC term is greater than the current term, update the current term and vote for the candidate
        if (rpc.term > configuration.currentTerm) {
            configuration.currentTerm = rpc.term
            configuration.votedFor = rpc.candidateId
        }

        // If the voter has already voted for a candidate in this term, return a response with voteGranted set to false
        if (
            configuration.votedFor &&
            configuration.votedFor !== rpc.candidateId
        ) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // If the candidate's log is not up-to-date, return a response with voteGranted set to false
        const lastLogIndex = configuration.log.length - 1
        const lastLogTerm = configuration.log[lastLogIndex].term
        if (
            lastLogTerm > rpc.lastLogTerm ||
            (lastLogTerm === rpc.lastLogTerm && lastLogIndex > rpc.lastLogIndex)
        ) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // Otherwise, return a response with voteGranted set to true
        configuration.votedFor = rpc.candidateId
        return {
            term: configuration.currentTerm,
            voteGranted: true,
        }
    }

    public appendEntries(configuration: Config, rpc: Append): AppendResult {
        // If the RPC term is less than the current term, return a response with success set to false
        if (rpc.term < configuration.currentTerm) {
            return {
                term: configuration.currentTerm,
                success: false,
                index: -1,
            }
        }

        // If the RPC term is greater than the current term, update the current term and set the node's state to follower
        if (rpc.term > configuration.currentTerm) {
            configuration.currentTerm = rpc.term
            configuration.state = State.FOLLOWER
        }

        // If the previous log index and term don't match the node's log, return a response with success set to false
        const prevLogIndex = rpc.prevLogIndex
        const prevLogTerm = rpc.prevLogTerm
        if (configuration.log[prevLogIndex]?.term !== prevLogTerm) {
            return {
                term: configuration.currentTerm,
                success: false,
                index: -1,
            }
        }

        // Otherwise, append the new entries to the log and return a response with success set to true
        configuration.log = [
            ...configuration.log.slice(0, prevLogIndex + 1),
            ...rpc.entries,
        ]
        configuration.commitIndex = Math.min(
            rpc.leaderCommit,
            configuration.log.length - 1,
        )
        return {
            term: configuration.currentTerm,
            success: true,
            index: configuration.commitIndex,
        }
    }

    public startElection(configuration: Config): void {
        // Increment the current term and set the node's state to candidate
        configuration.currentTerm++
        configuration.state = State.CANDIDATE

        // Reset the votedFor field
        configuration.votedFor = undefined

        // Request votes from other nodes
        this.sendRequestVoteRPC(configuration)
    }

    public sendRequestVoteRPC(configuration: Config): void {
        // Implementation omitted for brevity
        // Sends a RequestVoteRPC to other nodes in the cluster
    }

    // TODO: Connect to requests for rpc vote
    public handleRequestVoteRPC(configuration: Config, rpc: Vote): VoteResult {
        // If the RPC term is less than the current term, return a response with voteGranted set to false
        if (rpc.term < configuration.currentTerm) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // If the RPC term is greater than the current term, update the current term and set the node's state to follower
        if (rpc.term > configuration.currentTerm) {
            configuration.currentTerm = rpc.term
            configuration.state = State.FOLLOWER
        }

        // If the node is already a leader or a candidate, return a response with voteGranted set to false
        if (
            configuration.state === State.LEADER ||
            configuration.state === State.CANDIDATE
        ) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // If the node has already voted for another candidate in this term, return a response with voteGranted set to false
        if (
            configuration.votedFor &&
            configuration.votedFor !== rpc.candidateId
        ) {
            return {
                term: configuration.currentTerm,
                voteGranted: false,
            }
        }

        // Otherwise, return the result of the requestVote function
        return this.requestVote(configuration, rpc)
    }

    // TODO: connect with appendEntriesRPC
    public handleAppendEntriesRPC(
        configuration: Config,
        rpc: Append,
    ): AppendResult {
        // If the RPC term is less than the current term, return a response with success set to false
        if (rpc.term < configuration.currentTerm) {
            return {
                term: configuration.currentTerm,
                success: false,
                index: -1,
            }
        }

        // If the RPC term is greater than the current term, update the current term and set the node's state to follower
        if (rpc.term > configuration.currentTerm) {
            configuration.currentTerm = rpc.term
            configuration.state = State.FOLLOWER
        }

        // If the node is a leader, return a response with success set to false
        if (configuration.state === State.LEADER) {
            return {
                term: configuration.currentTerm,
                success: false,
                index: -1,
            }
        }

        // Otherwise, return the result of the appendEntries function
        return this.appendEntries(configuration, rpc)
    }

    public advanceCommitIndex(
        configuration: Config,
        responses: AppendResult[],
    ): void {
        // Sort the responses by term and index
        responses.sort((a, b) =>
            a.term !== b.term ? a.term - b.term : a.index - b.index,
        )

        // Find the highest index that is included in a majority of responses
        const majority = Math.floor(responses.length / 2) + 1
        let commitIndex = 0
        for (let i = 0; i < responses.length; i++) {
            if (
                responses.slice(0, i + 1).filter((r) => r.success).length >=
                majority
            ) {
                commitIndex = responses[i].index
            }
        }

        // Set the commit index to the highest index that is included in a majority of responses
        configuration.commitIndex = commitIndex
    }
}
