import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { ValidatedRelay } from 'src/validation/schemas/validated-relay'

export type VerificationDataDocument = HydratedDocument<VerificationData>

@Schema()
export class VerificationData {
    @Prop({ type: Number, required: true })
    verified_at: number

    @Prop({ type: Array<ValidatedRelay>, required: true })
    atornauts: ValidatedRelay[]
}

export const VerificationDataSchema =
    SchemaFactory.createForClass(VerificationData)
