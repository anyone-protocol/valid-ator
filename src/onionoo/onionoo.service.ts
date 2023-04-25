import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'
import { firstValueFrom, catchError } from 'rxjs'
import { DetailsResponse } from './interfaces/8_3/details-response'
import { RelayInfo } from './interfaces/8_3/relay-info'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { RelayData } from './schemas/relay-data'
import { OnionooServiceData } from './schemas/onionoo-service-data'
import { RelayDataDto } from './dto/relay-data-dto'
import { ethers } from "ethers";

@Injectable()
export class OnionooService {
    private readonly logger = new Logger(OnionooService.name)
    private dataId: Types.ObjectId
    private lastSeen: String = ''

    private readonly detailsUri = 'https://onionoo.torproject.org/details'
    private readonly currentApiVersion = '8.0' // as reported via Onionoo API (04_2023: inconsistently with documentation and content standard)
    private readonly atorKeyPattern = '@ator:'
    private readonly keyLength = 42

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
        })
        this.dataId = newData._id
    }

    async onApplicationBootstrap(): Promise<void> {
        const hasData = await this.onionooServiceDataModel.exists({
            apiVersion: this.currentApiVersion,
        })

        if (hasData) {
            const initData = await this.onionooServiceDataModel
                .findOne({ apiVersion: this.currentApiVersion })
                .catch((error) => {
                    this.logger.error(error)
                })

            if (initData != null) {
                this.lastSeen = initData.last_seen
                this.dataId = initData._id
            } else {
                this.logger.warn(
                    'This should not happen. Data was deleted, or is incorrect',
                )
                this.initServiceData()
            }
        } else this.initServiceData()

        this.logger.log(
            `Bootstrapping Onionoo Connector [seen: ${this.lastSeen}, id: ${this.dataId}]`,
        )
    }

    public async fetchNewRelays(): Promise<RelayInfo[]> {
        this.logger.debug(
            `Fetching new relays from Onionoo [seen: ${this.lastSeen}]`,
        )

        const requestStamp = Date.now()
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
                        )
                        throw 'Failed to fetch details from Onionoo'
                    }),
                ),
        )

        this.logger.debug(`Fetch details response ${status}`)
        var relays: RelayInfo[] = []
        if (status === 200) {
            relays = data.relays
            const lastModified = headers['last-modified']
            if (
                lastModified !== undefined &&
                typeof lastModified === 'string' &&
                requestStamp > Date.parse(lastModified)
            ) {
                this.lastSeen = new Date(lastModified).toUTCString()
                await this.onionooServiceDataModel.findByIdAndUpdate(
                    this.dataId,
                    { apiVersion: data.version, last_seen: this.lastSeen },
                )
            } else this.lastSeen = ''

            this.logger.log(
                `Received ${relays.length} relays from Onionoo [seen: ${this.lastSeen}]`,
            )
        } else this.logger.log('No new updates from Onionoo') // 304 - Not modified

        return relays
    }

    public extractAtorKey(inputString?: string): string {
        if (inputString !== undefined && inputString.length > 0) {
            const startIndex = inputString.indexOf(this.atorKeyPattern)
            if (startIndex > -1) {
                const baseIndex = startIndex + this.atorKeyPattern.length
                const keyIndex = inputString.indexOf('0x', baseIndex)
                if (keyIndex > -1) {
                    const endKeyIndex = keyIndex + this.keyLength
                    if (endKeyIndex <= inputString.length) {
                        const keyCandidate = inputString.substring(keyIndex, endKeyIndex)
                        this.logger.debug(`Found key candidate ${keyCandidate} in [${inputString}]`)
                        if (ethers.isAddress(keyCandidate)) 
                            return keyCandidate
                        else this.logger.warn('Invalid ator key (as checked by ethers) found after pattern in matched relay')
                    } else this.logger.warn('Invalid ator key candidate found after pattern in matched relay')
                } else this.logger.warn('Ator key not found after pattern in matched relay')
            } else this.logger.warn('Ator key pattern not found in matched relay')
        } else this.logger.warn('Attempting to extract empty key from matched relay')
        return ''
    }

    public async validateNewRelays(relays: RelayInfo[]): Promise<RelayDataDto[]> {
        this.logger.debug(`Validating ${relays.length} relays`)
        
        const validationStamp = Date.now()
        
        const matchingRelays = relays.filter((value, index, array) =>
            value.contact !== undefined
            && value.contact.includes(this.atorKeyPattern),
        )

        if (matchingRelays.length > 0)
            this.logger.log(`Validated ${matchingRelays.length} relays`)
        else if (relays.length > 0) this.logger.log('No new validations found')
        
        const relayData = matchingRelays.map<RelayDataDto>(
            (info, index, array) => (
                {
                    fingerprint: info.fingerprint,
                    contact: (info.contact !== undefined)? info.contact : '', // other case should not happen as its filtered out while creating validations array
                    validated_at: validationStamp,
                    ator_public_key: this.extractAtorKey(info.contact)
                }
        ))

        return relayData.filter((data, index, array) => data.ator_public_key.length > 0)
    }

    public async persistNewValidations(relays: RelayDataDto[]) {
        if (relays.length === 0) this.logger.debug('No relays to persist found')
        else {
            this.logger.debug(`Persisting ${relays.length} validated relays`)
            const validationStamp = Date.now()

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
                    .catch((error) => this.logger.error(error))

                this.logger.log(`Persisted validation of ${relay.fingerprint}`)
            })
        }
    }
}
