import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

@Schema()
export class VerifiedHardware {
  @Prop({ type: Number, required: true })
  verified_at: number

  @Prop({ type: String, required: true })
  deviceSerial: string

  @Prop({ type: String, required: true })
  atecSerial: string

  @Prop({ type: String, required: true })
  fingerprint: string

  @Prop({ type: String, required: true })
  address: string

  @Prop({ type: String, required: true })
  publicKey: string

  @Prop({ type: String, required: true })
  signature: string

  @Prop({ type: Number, required: false })
  nftId?: number

  @Prop({ type: Boolean, required: true, default: false })
  isHardwareProofValid: boolean
}

export type VerifiedHardwareDocument = HydratedDocument<VerifiedHardware>
export const VerifiedHardwareSchema =
  SchemaFactory.createForClass(VerifiedHardware)
