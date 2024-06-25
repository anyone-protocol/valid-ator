import { EvolvableState } from 'src/util/evolvable'
import { OwnableState } from 'src/util/ownable'
import { ContractFunctionInput } from 'src/util/contract-function-input'

export type Fingerprint = string
export type EvmAddress = string

export type Score = {
    score: string
    address: string
    fingerprint: string
}

export class DistributionResult {
    timeElapsed: string
    tokensDistributedPerSecond: string
    baseNetworkScore: string
    baseDistributedTokens: string
    bonuses: {
      hardware: {
        enabled: boolean
        tokensDistributedPerSecond: string
        networkScore: string
        distributedTokens: string
      }
    }
    totalTokensDistributedPerSecond: string
    totalNetworkScore: string
    totalDistributedTokens: string
  }

export type DistributionState = OwnableState & EvolvableState & {
    tokensDistributedPerSecond: string
    bonuses: {
      hardware: {
        enabled: boolean
        tokensDistributedPerSecond: string
        fingerprints: Fingerprint[]
      }
    }
    multipliers: {
      [fingerprint: Fingerprint]: string
    }
    pendingDistributions: {
      [timestamp: string]: { scores: Score[] }
    }
    claimable: {
      [address: EvmAddress]: string
    }
    previousDistributions: {
      [timestamp: string]: DistributionResult
    }
    previousDistributionsTrackingLimit: number
  }

export interface SetDistributionAmount extends ContractFunctionInput {
    function: 'setDistributionAmount'
    distributionAmount: string
}

export interface AddScores extends ContractFunctionInput {
    function: 'addScores'
    timestamp: string
    scores: Score[]
}

export interface Distribute extends ContractFunctionInput {
    function: 'distribute'
    timestamp: string
}

export interface CancelDistribution extends ContractFunctionInput {
    function: 'cancelDistribution'
    timestamp: string
}
