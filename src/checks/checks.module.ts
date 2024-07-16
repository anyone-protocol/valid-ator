import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { BalancesService } from './balances.service'
import { BalancesData, BalancesDataSchema } from './schemas/balances-data'
import { UserBalancesService } from './user-balances.service'

@Module({
    imports: [
        MongooseModule.forFeature([
            {
                name: BalancesData.name,
                schema: BalancesDataSchema,
            },
        ]),
    ],
    providers: [
        BalancesService,
        UserBalancesService
    ],
    exports: [
        BalancesService,
        UserBalancesService
    ],
})
export class ChecksModule {}
