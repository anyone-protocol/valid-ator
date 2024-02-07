import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type BalancesDataDocument = HydratedDocument<BalancesData>

@Schema()
export class BalancesData {
    @Prop({ type: Number, required: true })
    stamp: number

    @Prop({ type: String })
    relayRegistryOperator: string

    @Prop({ type: String })
    relayRegistryUploader: string

    @Prop({ type: String })
    distributionOperator: string

    @Prop({ type: String })
    facilityOperator: string

    @Prop({ type: String })
    facilityTokens: string

    @Prop({ type: String })
    registratorTokens: string
}

export const BalancesDataSchema = SchemaFactory.createForClass(BalancesData)
