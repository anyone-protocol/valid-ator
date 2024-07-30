import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class SeedLock {
  @Prop({ type: String, required: true })
  seedName: string

  @Prop({ type: Number, required: true, default: Date.now })
  startedAt?: number

  @Prop({ type: Number, required: false })
  finishedAt?: number
}

export type SeedLockDocument = HydratedDocument<SeedLock>
export const SeedLockSchema = SchemaFactory.createForClass(SeedLock)
