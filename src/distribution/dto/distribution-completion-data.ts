import { Score } from "../interfaces/distribution"

export class DistributionCompletionData {
    stamp: number
    total: number
    retries: number
    processed: Score[]
}
