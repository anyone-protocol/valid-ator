import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type OnionooServiceDataDocument = HydratedDocument<OnionooServiceData>

@Schema()
export class OnionooServiceData {
    @Prop({ type: String, required: true })
    apiVersion: string

    @Prop({ type: String })
    last_seen: string
}

export const OnionooServiceDataSchema =
    SchemaFactory.createForClass(OnionooServiceData)
