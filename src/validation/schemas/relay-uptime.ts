import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class RelayUptime {
  @Prop({ type: String, required: true, unique: true })
  fingerprint: string
}

export type RelayUptimeDocument = HydratedDocument<RelayUptime>
export const RelayUptimeSchema = SchemaFactory.createForClass(RelayUptime)
