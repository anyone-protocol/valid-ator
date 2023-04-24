import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OnionooService } from './onionoo.service';
import { MongooseModule } from '@nestjs/mongoose';
import { RelayData, RelayDataSchema } from './schemas/relay-data';
import {
    OnionooServiceData,
    OnionooServiceDataSchema,
} from './schemas/onionoo-service-data';

@Module({
    imports: [
        HttpModule.register({ timeout: 60 * 1000, maxRedirects: 3 }),
        MongooseModule.forFeature([
            { name: OnionooServiceData.name, schema: OnionooServiceDataSchema },
        ]),
        MongooseModule.forFeature([
            { name: RelayData.name, schema: RelayDataSchema },
        ]),
    ],
    providers: [OnionooService],
    exports: [OnionooService],
})
export class OnionooModule {}
