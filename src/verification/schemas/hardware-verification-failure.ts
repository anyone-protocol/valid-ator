import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import {
  RelayHardwareInfo
} from 'src/validation/schemas/validated-relay'

@Schema()
export class HardwareVerificationFailure {
  @Prop({ type: String, required: true, index: true })
  fingerprint: string

  @Prop({ type: String, required: true })
  address: string

  @Prop({ type: Number, required: true })
  timestamp: number

  @Prop({ type: Object })
  hardware_info?: RelayHardwareInfo
}

export type HardwareVerificationFailureDocument =
  HydratedDocument<HardwareVerificationFailure>
export const HardwareVerificationFailureSchema =
  SchemaFactory.createForClass(HardwareVerificationFailure)
