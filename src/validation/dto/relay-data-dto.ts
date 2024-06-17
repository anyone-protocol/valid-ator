export class RelayDataDto {
    readonly fingerprint: string
    readonly contact: string
    readonly primary_address_hex: string

    readonly running: boolean
    readonly consensus_weight: number
    readonly consensus_measured: boolean
    readonly consensus_weight_fraction: number
    readonly version: string
    readonly version_status: string
    readonly bandwidth_rate: number
    readonly bandwidth_burst: number
    readonly observed_bandwidth: number
    readonly advertised_bandwidth: number
    readonly effective_family: string[]
}
