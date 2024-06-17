import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type RelayDataDocument = HydratedDocument<RelayData>

@Schema()
export class RelayData {
    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: Number, required: true })
    validated_at: number

    @Prop({ type: String, required: true })
    ator_address: string

    @Prop({ type: String, required: false })
    primary_address_hex: string

    @Prop({ type: Boolean, required: false, default: false })
    running: boolean

    @Prop({ type: Number, required: false, default: 0 })
    consensus_weight: number

    @Prop({ type: Boolean, required: false, default: false })
    consensus_measured: boolean

    @Prop({ type: Number, required: false, default: 0 })
    consensus_weight_fraction: number

    @Prop({ type: String, required: false, default: '' })
    version: string

    @Prop({ type: String, required: false, default: '' })
    version_status: string

    @Prop({ type: Number, required: false, default: 0 })
    bandwidth_rate: number

    @Prop({ type: Number, required: false, default: 0 })
    bandwidth_burst: number

    @Prop({ type: Number, required: false, default: 0 })
    observed_bandwidth: number

    @Prop({ type: Number, required: false, default: 0 })
    advertised_bandwidth: number

    @Prop({ type: [String], required: false, default: [] })
    family: string[]
}

export const RelayDataSchema = SchemaFactory.createForClass(RelayData)
