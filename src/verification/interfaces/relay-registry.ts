import { EvolvableState } from 'src/util/evolvable'
import { OwnableState } from 'src/util/ownable'
import { ContractFunctionInput } from 'src/util/contract-function-input'

export type Fingerprint = string
export type EvmAddress = string

export type RelayRegistryState = OwnableState &
    EvolvableState & {
        claimable: { [address in Fingerprint as string]: EvmAddress }
        verified: { [address in Fingerprint as string]: EvmAddress }
        registrationCredits: { [address in EvmAddress as string]: number }
        blockedAddresses: EvmAddress[]
        families: { [fingerprint in Fingerprint as string]: Fingerprint[] }
    }

export interface AddClaimable extends ContractFunctionInput {
    function: 'addClaimable'
    fingerprint: Fingerprint
    address: EvmAddress
}

export interface RemoveClaimable extends ContractFunctionInput {
    function: 'removeClaimable'
    fingerprint: Fingerprint
}

export interface Claimable extends ContractFunctionInput {
    function: 'claimable'
    address?: EvmAddress
}

export interface IsClaimable extends ContractFunctionInput {
    function: 'isClaimable'
    fingerprint: Fingerprint
    address: EvmAddress
}

export interface Claim extends ContractFunctionInput {
    function: 'claim'
    fingerprint: Fingerprint
}

export interface Renounce extends ContractFunctionInput {
    function: 'renounce'
    fingerprint: Fingerprint
}

export interface RemoveVerified extends ContractFunctionInput {
    function: 'removeVerified'
    fingerprint: Fingerprint
}

export interface Verified extends ContractFunctionInput {
    function: 'verified'
    address?: EvmAddress
}

export interface IsVerified extends ContractFunctionInput {
    function: 'isVerified'
    fingerprint: Fingerprint
}

export interface AddRegistrationCredit extends ContractFunctionInput {
    function: 'addRegistrationCredit'
    address: EvmAddress
}

export interface BlockAddress extends ContractFunctionInput {
    function: 'blockAddress',
    address: EvmAddress
}

export interface UnblockAddress extends ContractFunctionInput {
    function: 'unblockAddress',
    address: EvmAddress
}

export interface SetFamily extends ContractFunctionInput {
    function: 'setFamily',
    fingerprint: Fingerprint,
    family: Fingerprint[]
}
