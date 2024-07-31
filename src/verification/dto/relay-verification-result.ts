export type RelayVerificationResult =
    | 'OK'
    | 'AlreadyVerified'
    | 'AlreadyRegistered'
    | 'HardwareProofFailed'
    | 'Failed'
    | 'AlreadySetFamily'
