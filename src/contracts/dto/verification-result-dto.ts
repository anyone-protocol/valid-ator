import { RelayVerificationResult } from './relay-verification-result'

export class VerificationResultDto {
    readonly fingerprint: string
    readonly address: string
    readonly result: RelayVerificationResult
}
