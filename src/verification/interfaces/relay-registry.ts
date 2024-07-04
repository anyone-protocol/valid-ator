import { EvolvableState } from 'src/util/evolvable'
import { OwnableState } from 'src/util/ownable'
import { ContractFunctionInput } from 'src/util/contract-function-input'

export type Fingerprint = string
export type EvmAddress = string
export type PublicKey = string

export type RelayRegistryState = OwnableState & EvolvableState & {
    claimable: { [fingerprint in Fingerprint as string]: EvmAddress }
    verified: { [fingerprint in Fingerprint as string]: EvmAddress }
    registrationCredits: { [address in EvmAddress as string]: number }
    blockedAddresses: EvmAddress[]
    families: { [fingerprint in Fingerprint as string]: Fingerprint[] }
    registrationCreditsRequired: boolean
    encryptionPublicKey: string
    serials: {
      [fingerprint in Fingerprint as string]: {
        serial?: string
        verified?: boolean
      }
    }
    familyRequired: boolean
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
  
export interface ToggleRegistrationCreditRequirement
  extends ContractFunctionInput
{
  function: 'toggleRegistrationCreditRequirement'
  enabled: boolean
}

export interface SetEncryptionPublicKey extends ContractFunctionInput {
  function: 'setEncryptionPublicKey'
  encryptionPublicKey: PublicKey
}

export interface VerifySerials extends ContractFunctionInput {
  function: 'verifySerials'
  fingerprints: Fingerprint[]
}

export interface RemoveSerials extends ContractFunctionInput {
  function: 'removeSerials'
  fingerprints: Fingerprint[]
}

export interface GetVerifiedRelays extends ContractFunctionInput {
  function: 'getVerifiedRelays'
}

export interface ToggleFamilyRequirement extends ContractFunctionInput {
  function: 'toggleFamilyRequirement'
  enabled: boolean
}
