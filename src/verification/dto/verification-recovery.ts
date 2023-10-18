import { VerificationData } from '../schemas/verification-data'
import { VerificationResults } from './verification-result-dto'

export class VerificationRecovery {
    readonly retriesLeft: number
    readonly verificationResults: VerificationResults
    readonly verificationData: VerificationData
}
