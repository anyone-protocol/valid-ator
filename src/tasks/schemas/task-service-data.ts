import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type TaskServiceDataDocument = HydratedDocument<TaskServiceData>

@Schema()
export class TaskServiceData {
    @Prop({ type: Boolean, default: false })
    isValidating: boolean

    @Prop({ type: Boolean, default: false })
    isCheckingBalances: boolean
}

export const TaskServiceDataSchema =
    SchemaFactory.createForClass(TaskServiceData)
