import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { ScoreData } from './score-data'
import { DistributionState, PreviousDistributionSummary } from '../interfaces/distribution'

export type DistributionDataDocument = HydratedDocument<DistributionData>

@Schema()
export class DistributionData {
    @Prop({ type: Number, required: true })
    stamp: number

    @Prop({ type: Number, required: false, default: false })
    complete: boolean

    @Prop({ type: Array<ScoreData>, required: true })
    scores: ScoreData[]

    @Prop({ type: PreviousDistributionSummary, required: false })
    summary?: PreviousDistributionSummary

    @Prop({ type: String, required: false })
    summary_tx?: string
}

export const DistributionDataSchema =
    SchemaFactory.createForClass(DistributionData)
