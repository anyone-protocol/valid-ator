import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom, catchError } from 'rxjs';
import { DetailsResponse } from './interfaces/8_3/details-response';
import { RelayInfo } from './interfaces/8_3/relay-info';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RelayData } from './schemas/relay-data';
import { OnionooServiceData } from './schemas/onionoo-service-data';

@Injectable()
export class OnionooService {
    private readonly logger = new Logger(OnionooService.name);
    private dataId: Types.ObjectId;
    private lastSeen: String = '';

    private readonly detailsUri = 'https://onionoo.torproject.org/details';
    private readonly currentApiVersion = '8.0'; // as reported via Onionoo API (04_2023: inconsistently with documentation and content standard)

    constructor(
        private readonly httpService: HttpService,
        @InjectModel(RelayData.name)
        private readonly relayDataModel: Model<RelayData>,
        @InjectModel(OnionooServiceData.name)
        private readonly onionooServiceDataModel: Model<OnionooServiceData>,
    ) {}

    async initServiceData(): Promise<void> {
        const newData = await this.onionooServiceDataModel.create({
            apiVersion: this.currentApiVersion,
            last_seen: '',
        });
        this.dataId = newData._id;
    }

    async onApplicationBootstrap(): Promise<void> {
        const hasData = await this.onionooServiceDataModel.exists({
            apiVersion: this.currentApiVersion,
        });

        if (hasData) {
            const initData = await this.onionooServiceDataModel
                .findOne({ apiVersion: this.currentApiVersion })
                .catch((error) => {
                    this.logger.error(error);
                });

            if (initData != null) {
                this.lastSeen = initData.last_seen;
                this.dataId = initData._id;
            } else {
                // this should not happen
                this.logger.warn('Data was deleted, or is incorrect');
                this.initServiceData();
            }
        } else this.initServiceData();

        this.logger.log(
            `Bootstrapping Onionoo Connector [seen: ${this.lastSeen}, id: ${this.dataId}]`,
        );
    }

    public async fetchNewRelays(): Promise<RelayInfo[]> {
        this.logger.debug(
            `Fetching new relays from Onionoo [seen: ${this.lastSeen}]`,
        );

        const requestStamp = Date.now();
        const { headers, status, data } = await firstValueFrom(
            this.httpService
                .get<DetailsResponse>(this.detailsUri, {
                    headers: {
                        'content-encoding': 'gzip',
                        'if-modified-since': `${this.lastSeen}`,
                    },
                    validateStatus: (status) =>
                        status === 304 || status === 200,
                })
                .pipe(
                    catchError((error: AxiosError) => {
                        this.logger.error(
                            `Fetching relays failed with ${error.response?.status}`,
                        );
                        throw 'Failed to fetch details from Onionoo';
                    }),
                ),
        );

        this.logger.debug(`Fetch details response ${status}`);
        var relays: RelayInfo[] = [];
        if (status === 200) {
            relays = data.relays;
            const lastModified = headers['last-modified'];
            if (
                lastModified !== undefined &&
                typeof lastModified === 'string' &&
                requestStamp > Date.parse(lastModified)
            ) {
                this.lastSeen = new Date(lastModified).toUTCString();
                await this.onionooServiceDataModel.findByIdAndUpdate(
                    this.dataId,
                    { apiVersion: data.version, last_seen: this.lastSeen },
                );
            } else this.lastSeen = '';

            this.logger.log(
                `Received ${relays.length} relays from Onionoo [seen: ${this.lastSeen}]`,
            );
        } else this.logger.log('No new updates from Onionoo'); // 304 - Not modified

        return relays;
    }

    public async validateNewRelays(relays: RelayInfo[]): Promise<RelayInfo[]> {
        this.logger.debug(`Validating ${relays.length} relays`);

        const validated = relays.filter((value, index, array) =>
            value.contact?.includes('protonmail'),
        );

        if (validated.length > 0)
            this.logger.log(`Validated ${validated.length} relays`);
        else this.logger.debug('No new validations found');

        return validated;
    }

    public async persistNewValidations(relays: RelayInfo[]) {
        if (relays.length === 0)
            this.logger.debug('No relays to persist found');
        else {
            this.logger.debug(`Persisting ${relays.length} validated relays`);
            const validationStamp = Date.now();

            relays.forEach(async (relay, index, array) => {
                const persistResult = await this.relayDataModel
                    .updateOne(
                        { fingerprint: relay.fingerprint },
                        {
                            fingerprint: relay.fingerprint,
                            contact: relay.contact,
                            validated_at: validationStamp,
                        },
                        { upsert: true, setDefaultsOnInsert: true },
                    )
                    .catch((error) => this.logger.error(error));

                this.logger.log(`Persisted validation of ${relay.fingerprint}`);
            });
        }
    }
}
