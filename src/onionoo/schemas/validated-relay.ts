import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { RelayData } from './relay-data'

export type ValidatedRelayDocument = HydratedDocument<ValidatedRelay>

@Schema()
export class ValidatedRelay {
    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: String, required: true })
    ator_public_key: string
}

export const ValidatedRelaySchema = SchemaFactory.createForClass(ValidatedRelay)
