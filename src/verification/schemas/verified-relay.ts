import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type VerifiedRelayDocument = HydratedDocument<VerifiedRelay>

@Schema()
export class VerifiedRelay {
    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: String, required: true })
    address: string

    @Prop({ type: Number, required: false, default: 0 })
    score: number
}

export const VerifiedRelaySchema = SchemaFactory.createForClass(VerifiedRelay)
