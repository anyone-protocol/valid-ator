import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type RelayDataDocument = HydratedDocument<RelayData>

@Schema()
export class RelayData {
    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: String, required: true })
    contact: string

    @Prop({ type: Number, required: true })
    validated_at: number
}

export const RelayDataSchema = SchemaFactory.createForClass(RelayData)
