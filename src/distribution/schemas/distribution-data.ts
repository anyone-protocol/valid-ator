import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { ScoreData } from './score-data'
import { DistributionResult } from '../interfaces/distribution'

export type DistributionDataDocument = HydratedDocument<DistributionData>

@Schema()
export class DistributionData {
    @Prop({ type: Number, required: true })
    stamp: number

    @Prop({ type: Number, required: false, default: false })
    complete: boolean

    @Prop({ type: Array<ScoreData>, required: true })
    scores: ScoreData[]

    @Prop({ type: DistributionResult, required: false })
    summary?: DistributionResult

    @Prop({ type: String, required: false })
    summary_tx?: string
}

export const DistributionDataSchema =
    SchemaFactory.createForClass(DistributionData)
