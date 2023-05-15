import { RelayVerificationResult } from './relay-verification-result'

export type VerifiedRelays = VerificationResultDto[]

export class VerificationResultDto {
    readonly fingerprint: string
    readonly address: string
    readonly result: RelayVerificationResult
    readonly network_weight: number
}
