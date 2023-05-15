import { BridgeInfo } from './bridge-info'
import { RelayInfo } from './relay-info'

export interface DetailsResponse {
    version: String
    build_revision: String
    relays_published: String
    relays: RelayInfo[]
    bridges_published: String
    bridges: BridgeInfo[]
}
