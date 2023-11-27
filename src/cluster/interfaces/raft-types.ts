export type Term = number
export type LogIndex = number

export enum State {
    FOLLOWER = 'follower',
    CANDIDATE = 'candidate',
    LEADER = 'leader',
}

export type Id = string

export type Entry = {
    term: Term
    command: any
}

export type Log = Entry[]

export type FSM = {
    applyCommand: (command: any) => void
}

export type Config = {
    id: Id
    stateMachine: FSM
    currentTerm: Term
    votedFor?: Id
    log: Log
    state: State
    commitIndex: LogIndex
}

export type Vote = {
    term: Term
    candidateId: Id
    lastLogIndex: LogIndex
    lastLogTerm: Term
}

export type VoteResult = {
    term: Term
    voteGranted: boolean
}

export type Append = {
    term: Term
    leaderId: Id
    prevLogIndex: LogIndex
    prevLogTerm: Term
    entries: Entry[]
    leaderCommit: LogIndex
}

export type AppendResult = {
    term: Term
    success: boolean
    index: LogIndex
}
