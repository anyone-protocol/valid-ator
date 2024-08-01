import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type ValidatedRelayDocument = HydratedDocument<ValidatedRelay>

export type RelayHardwareInfo = {
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

@Schema()
export class ValidatedRelay {
    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: String, required: true })
    ator_address: string

    @Prop({ type: Number, required: false, default: 0 })
    consensus_weight: number

    @Prop({ type: Number, required: false, default: 0 })
    consensus_weight_fraction: number

    @Prop({ type: Number, required: false, default: 0 })
    observed_bandwidth: number

    @Prop({ type: Boolean, required: false, default: false })
    running: boolean

    @Prop({ type: [String], required: false, default: [] })
    family: string[]

    @Prop({ type: Boolean, required: false, default: false })
    consensus_measured: boolean

    @Prop({ type: String, required: true })
    primary_address_hex: string

    @Prop({ type: String, required: false })
    nickname?: string

    @Prop({ type: Object, required: false })
    hardware_info?: RelayHardwareInfo

    @Prop({ type: Boolean, required: false, default: false })
    hardware_validated?: boolean

    @Prop({ type: Number, required: false })
    hardware_validated_at?: number
}

export const ValidatedRelaySchema = SchemaFactory.createForClass(ValidatedRelay)
