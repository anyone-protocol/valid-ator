import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type BalancesDataDocument = HydratedDocument<BalancesData>

@Schema()
export class BalancesData {
    @Prop({ type: Number, required: true })
    stamp: number

    @Prop({ type: Number })
    verification: number

    @Prop({ type: Boolean })
    isDistributing: boolean
}

export const BalancesDataSchema =
    SchemaFactory.createForClass(BalancesData)
