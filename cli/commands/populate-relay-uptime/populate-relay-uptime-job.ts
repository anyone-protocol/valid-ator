import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class PopulateRelayUptimeJob {
  @Prop({ type: String, required: true, index: -1 })
  validation_date: string

  @Prop({ type: Number, required: true, default: Date.now })
  startedAt?: number

  @Prop({ type: Number, required: false })
  finishedAt?: number

  @Prop({ type: Boolean, required: false })
  success?: boolean

  @Prop({ type: Number, required: true })
  uptimeMinimumRunningCount: number
}

export type RelayUptimeJobDocument = HydratedDocument<PopulateRelayUptimeJob>
export const RelayUptimeJobSchema =
  SchemaFactory.createForClass(PopulateRelayUptimeJob)
