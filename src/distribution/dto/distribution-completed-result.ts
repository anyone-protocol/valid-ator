import { DistributionData } from '../schemas/distribution-data'

export type DistributionCompletedResults = Pick<
  DistributionData,
  'complete' | 'stamp' | 'scores'
>
