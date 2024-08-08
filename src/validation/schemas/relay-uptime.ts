import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class RelayUptime {
  @Prop({ type: String, required: true })
  fingerprint: string

  @Prop({ type: String, required: true })
  validation_date: string

  @Prop({ type: Number, required: true, default: 0 })
  uptime_days: number

  @Prop({ type: Boolean, required: true })
  uptime_valid: boolean

  @Prop({ type: [Number], required: true, default: [] })
  seen_running_timestamps: number[]

  @Prop({ type: [Number], required: true, default: [] })
  seen_not_running_timestamps: number[]
}

export type RelayUptimeDocument = HydratedDocument<RelayUptime>
export const RelayUptimeSchema = SchemaFactory
  .createForClass(RelayUptime)
  .index({ fingerprint: 1, validation_date: -1 })
