import { EvolvableState } from '../../util/evolvable'
import { OwnableState } from '../../util/ownable'
import { ContractFunctionInput } from 'src/util/contract-function-input'

export type Fingerprint = string
export type EvmAddress = string

export type RelayRegistryState = OwnableState &
    EvolvableState & {
        claims: { [address in EvmAddress as string]: Fingerprint[] }
        verified: { [fingerprint: Fingerprint]: EvmAddress }
    }

export interface Register extends ContractFunctionInput {
    function: 'register'
    fingerprint: Fingerprint
}

export interface Verify extends ContractFunctionInput {
    function: 'verify'
    fingerprint: Fingerprint
    address: EvmAddress
}

export interface Unregister extends ContractFunctionInput {
    function: 'unregister'
    fingerprint: Fingerprint
}

export interface RemoveStale extends ContractFunctionInput {
    function: 'remove-stale'
    fingerprint: Fingerprint
}
