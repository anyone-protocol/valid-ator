export class RelayDataDto {
    readonly fingerprint: string
    readonly contact: string
    readonly primary_address_hex: string
    readonly nickname: string

    readonly running: boolean
    readonly last_seen: string
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

    readonly hardware_info?: {
        id?: string
        company?: string
        format?: string
        wallet?: string
        fingerprint?: string
        nftid?: string
        build?: string
        flags?: string
        serNums?: {
            type?: string
            number?: string
        }[]
        pubKeys?: {
            type?: string
            number?: string
        }[]
        certs?: {
            type?: string
            signature?: string
        }[]
    }
}
