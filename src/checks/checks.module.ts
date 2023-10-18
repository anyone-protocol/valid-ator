import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { BalancesService } from './balances.service'
import { BalancesData, BalancesDataSchema } from './schemas/balances-data'

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: BalancesData.name,
                schema: BalancesDataSchema,
            },
        ]),
    ],
    providers: [BalancesService],
    exports: [BalancesService],
})
export class ChecksModule {}
