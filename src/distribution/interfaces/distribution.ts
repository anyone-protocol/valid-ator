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
    quality: {
      enabled: boolean
      tokensDistributedPerSecond: string
      settings: {
        uptime: {
          [days: number]: number
        }
      }
      uptime: {
        [fingerprint: Fingerprint]: number
      }
      networkScore: string
      distributedTokens: string
    }
  }
  multipliers: {
    family: {
      enabled: boolean
      familyMultiplierRate: string
    }
  }
  families: { [fingerprint in Fingerprint as string]: Fingerprint[] }
  totalTokensDistributedPerSecond: string
  totalNetworkScore: string
  totalDistributedTokens: string
  details: {
    [fingerprint: Fingerprint]: {
      address: EvmAddress
      score: string
      distributedTokens: string
      bonuses: {
        hardware: string
        quality: string
      }
      multipliers: {
        family: string
        region: string
      }
    }
  }
}

export type DistributionState = OwnableState & EvolvableState & {
  tokensDistributedPerSecond: string
  bonuses: {
    hardware: {
      enabled: boolean
      tokensDistributedPerSecond: string
      fingerprints: Fingerprint[]
    },
    quality: {
      enabled: boolean
      tokensDistributedPerSecond: string
      settings: {
        uptime: {
          [days: number]: number
        }
      }
      uptime: {
        [fingerprint: Fingerprint]: number
      }
    }
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
  families: { [fingerprint in Fingerprint as string]: Fingerprint[] }
  multipliers: {
    family: {
      enabled: boolean
      familyMultiplierRate: string
    }
  }
}

export interface SetTokenDistributionRate extends ContractFunctionInput {
  function: 'setTokenDistributionRate'
  tokensDistributedPerSecond: string
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

export interface SetHardwareBonusRate extends ContractFunctionInput {
  function: 'setHardwareBonusRate'
  tokensDistributedPerSecond: string
}

export interface SetQualityTierBonusRate extends ContractFunctionInput {
  function: 'setQualityTierBonusRate'
  tokensDistributedPerSecond: string
}

export interface ToggleHardwareBonus extends ContractFunctionInput {
  function: 'toggleHardwareBonus'
  enabled: boolean
}

export interface ToggleQualityTierBonus extends ContractFunctionInput {
  function: 'toggleQualityTierBonus'
  enabled: boolean
}

export interface SetQualityTierBonusSettings extends ContractFunctionInput {
  function: 'setQualityTierBonusSettings'
  settings: {
    uptime: {
      [days: number]: number
    }
  }
}

export interface SetQualityTierUptimes extends ContractFunctionInput {
  function: 'setQualityTierUptimes',
  uptimes: { [fingerprint: Fingerprint]: number }
}

export interface AddFingerprintsToBonus extends ContractFunctionInput {
  function: 'addFingerprintsToBonus'
  bonusName: string
  fingerprints: Fingerprint[]
}

export interface RemoveFingerprintsFromBonus extends ContractFunctionInput {
  function: 'removeFingerprintsFromBonus'
  bonusName: string
  fingerprints: Fingerprint[]
}

export interface SetFamilyMultiplierRate extends ContractFunctionInput {
  function: 'setFamilyMultiplierRate'
  familyMultiplierRate: string
}

export interface SetFamilies extends ContractFunctionInput {
  function: 'setFamilies'
  families: {
    fingerprint: Fingerprint
    add?: Fingerprint[],
    remove?: Fingerprint[]
  }[]
}

export interface ToggleFamilyMultipliers extends ContractFunctionInput {
  function: 'toggleFamilyMultipliers'
  enabled: boolean
}

export interface SetPreviousDistributionTrackingLimit
  extends ContractFunctionInput
{
  function: 'setPreviousDistributionTrackingLimit'
  limit: number
}

export interface Claimable extends ContractFunctionInput {
  function: 'claimable'
  address?: EvmAddress
}
