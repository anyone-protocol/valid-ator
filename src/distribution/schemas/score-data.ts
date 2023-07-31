import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type ScoreDataDocument = HydratedDocument<ScoreData>

@Schema()
export class ScoreData {
    @Prop({ type: String, required: true })
    ator_address: string

    @Prop({ type: String, required: true })
    fingerprint: string

    @Prop({ type: Number, required: true })
    score: number
}

export const ScoreDataSchema = SchemaFactory.createForClass(ScoreData)
