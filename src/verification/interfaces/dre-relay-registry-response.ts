import { RelayRegistryState } from "./relay-registry"

export interface DreRelayRegistryResponse {
    readonly status: string
    readonly contractTxId: string
    readonly state: RelayRegistryState
    readonly sortKey: string
    readonly signature: string
    readonly stateHash: string
}