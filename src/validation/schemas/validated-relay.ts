import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type ValidatedRelayDocument = HydratedDocument<ValidatedRelay>

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
}

export const ValidatedRelaySchema = SchemaFactory.createForClass(ValidatedRelay)
