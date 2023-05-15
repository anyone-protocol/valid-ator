import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { VerifiedRelay } from './verified-relay'

export type VerificationDataDocument = HydratedDocument<VerificationData>

@Schema()
export class VerificationData {
    @Prop({ type: Number, required: true })
    verified_at: number

    @Prop({ type: Array<VerifiedRelay>, required: true })
    atornauts: VerifiedRelay[]
}

export const VerificationDataSchema =
    SchemaFactory.createForClass(VerificationData)
