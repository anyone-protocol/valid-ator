import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type ValidationServiceDataDocument =
    HydratedDocument<ValidationServiceData>

@Schema()
export class ValidationServiceData {
    @Prop({ type: String, required: true })
    apiVersion: string

    @Prop({ type: String })
    last_seen: string
}

export const ValidationServiceDataSchema = SchemaFactory.createForClass(
    ValidationServiceData,
)
