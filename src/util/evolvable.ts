import { EvolveState } from 'warp-contracts'

import { OwnableState } from './ownable'

export type EvolvableState = Partial<EvolveState> & OwnableState
