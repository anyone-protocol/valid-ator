import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class RelaySaleData {
  @Prop({ type: Number, required: true })
  nftId: number

  @Prop({ type: String, required: true })
  serial: string
}

export type RelaySaleDataDocument = HydratedDocument<RelaySaleData>
export const RelaySaleDataSchema = SchemaFactory.createForClass(RelaySaleData)
