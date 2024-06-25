import { DistributionState } from "./distribution"

export interface DreDistributionResponse {
    readonly status: string
    readonly contractTxId: string
    readonly state: DistributionState
    readonly sortKey: string
    readonly signature: string
    readonly stateHash: string
}