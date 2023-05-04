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
    ator_public_key: string

    @Prop({ type: String, required: false, default: 0 })
    consensus_weight: number
}

export const RelayDataSchema = SchemaFactory.createForClass(RelayData)
