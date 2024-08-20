import { ValidatedRelay } from 'src/validation/schemas/validated-relay'
import { RelayVerificationResult } from './relay-verification-result'

export type VerificationResults = VerificationResultDto[]
export class VerificationResultDto {
    readonly result: RelayVerificationResult
    readonly relay: ValidatedRelay
}
