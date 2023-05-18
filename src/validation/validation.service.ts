import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'
import { firstValueFrom, catchError } from 'rxjs'
import { DetailsResponse } from './interfaces/8_3/details-response'
import { RelayInfo } from './interfaces/8_3/relay-info'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { RelayData } from './schemas/relay-data'
import { ValidationServiceData } from './schemas/validation-service-data'
import { RelayDataDto } from './dto/relay-data-dto'
import { ethers } from 'ethers'
import { ConfigService } from '@nestjs/config'
import { ValidationData } from './schemas/validation-data'
import { ValidatedRelay } from './schemas/validated-relay'

@Injectable()
export class ValidationService {
    private readonly logger = new Logger(ValidationService.name)
    private dataId: Types.ObjectId
    private lastSeen: String = ''

    private readonly currentApiVersion = '8.0' // as reported via Onionoo API (04_2023: inconsistently with documentation and content standard)
    private readonly atorKeyPattern = '@ator:' // this pattern should be lowercase
    private readonly keyLength = 42

    constructor(
        private readonly httpService: HttpService,
        private readonly config: ConfigService<{ ONIONOO_DETAILS_URI: string }>,
        @InjectModel(RelayData.name)
        private readonly relayDataModel: Model<RelayData>,
        @InjectModel(ValidationServiceData.name)
        private readonly validationServiceDataModel: Model<ValidationServiceData>,
        @InjectModel(ValidationData.name)
        private readonly validationDataModel: Model<ValidationData>,
    ) {}

    async initServiceData(): Promise<void> {
        const newData = await this.validationServiceDataModel.create({
            apiVersion: this.currentApiVersion,
            last_seen: '',
        })
        this.dataId = newData._id
    }

    async onApplicationBootstrap(): Promise<void> {
        const hasData = await this.validationServiceDataModel.exists({
            apiVersion: this.currentApiVersion,
        })

        if (hasData) {
            const initData = await this.validationServiceDataModel
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
            `Bootstrapped Onionoo Connector [seen: ${this.lastSeen}, id: ${this.dataId}]`,
        )
    }

    public async fetchNewRelays(): Promise<RelayInfo[]> {
        this.logger.debug(
            `Fetching new relays from Onionoo [seen: ${this.lastSeen}]`,
        )

        var relays: RelayInfo[] = []
        const detailsUri = this.config.get<string>('ONIONOO_DETAILS_URI', {
            infer: true,
        })
        if (detailsUri !== undefined) {
            const requestStamp = Date.now()
            const { headers, status, data } = await firstValueFrom(
                this.httpService
                    .get<DetailsResponse>(detailsUri, {
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
                                `Fetching relays from ${detailsUri} failed with ${error.response?.status}`,
                            )
                            throw 'Failed to fetch details from Onionoo'
                        }),
                    ),
            )

            this.logger.debug(
                `Fetch details from ${detailsUri} response ${status}`,
            )
            if (status === 200) {
                relays = data.relays
                const lastMod = headers['last-modified']
                if (
                    lastMod !== undefined &&
                    typeof lastMod === 'string' &&
                    requestStamp > Date.parse(lastMod)
                ) {
                    this.lastSeen = new Date(lastMod).toUTCString()
                    await this.validationServiceDataModel.findByIdAndUpdate(
                        this.dataId,
                        { apiVersion: data.version, last_seen: this.lastSeen },
                    )
                } else this.lastSeen = ''

                this.logger.log(
                    `Received ${relays.length} relays from Onionoo [seen: ${this.lastSeen}]`,
                )
            } else this.logger.debug('No new updates from Onionoo') // 304 - Not modified
        } else
            this.logger.warn(
                'Set the ONIONOO_DETAILS_URI in ENV vars or configuration',
            )

        return relays
    }

    public extractAtorKey(inputString?: string): string {
        if (inputString !== undefined && inputString.length > 0) {
            const startIndex = inputString
                .toLowerCase()
                .indexOf(this.atorKeyPattern)
            if (startIndex > -1) {
                const baseIndex = startIndex + this.atorKeyPattern.length
                const fixedInput = inputString.replace('0X', '0x')
                const keyIndex = fixedInput.indexOf('0x', baseIndex)
                if (keyIndex > -1) {
                    const endKeyIndex = keyIndex + this.keyLength
                    if (endKeyIndex <= fixedInput.length) {
                        const keyCandidate = fixedInput.substring(
                            keyIndex,
                            endKeyIndex,
                        )
                        this.logger.debug(
                            `Found key candidate ${keyCandidate} in [${inputString}]`,
                        )
                        if (ethers.isAddress(keyCandidate))
                            return ethers.getAddress(keyCandidate)
                        else
                            this.logger.warn(
                                'Invalid ator key (as checked by ethers) found after pattern in matched relay',
                            )
                    } else
                        this.logger.warn(
                            'Invalid ator key candidate found after pattern in matched relay',
                        )
                } else
                    this.logger.warn(
                        `Ator key not found after pattern in matched relay for input: ${inputString}`,
                    )
            } else
                this.logger.warn(
                    `Ator key pattern not found in matched relay for input: ${inputString}`,
                )
        } else
            this.logger.warn(
                'Attempting to extract empty key from matched relay',
            )

        return ''
    }

    public async filterRelays(relays: RelayInfo[]): Promise<RelayDataDto[]> {
        this.logger.debug(`Filtering ${relays.length} relays`)

        const matchingRelays = relays.filter(
            (value, index, array) =>
                value.contact !== undefined &&
                value.contact.toLowerCase().includes(this.atorKeyPattern),
        )

        if (matchingRelays.length > 0)
            this.logger.log(`Filtered ${matchingRelays.length} relays`)
        else if (relays.length > 0)
            this.logger.log('No new interesting relays found')

        const relayData = matchingRelays.map<RelayDataDto>(
            (info, index, array) => ({
                fingerprint: info.fingerprint,
                contact: info.contact !== undefined ? info.contact : '', // other case should not happen as its filtered out while creating validations array
                consensus_weight: info.consensus_weight,

                running: info.running,
                consensus_measured: info.measured ?? false,
                consensus_weight_fraction: info.consensus_weight_fraction ?? 0,
                version: info.version ?? '?',
                version_status: info.version_status ?? '',
                bandwidth_rate: info.bandwidth_rate ?? 0,
                bandwidth_burst: info.bandwidth_burst ?? 0,
                observed_bandwidth: info.observed_bandwidth ?? 0,
                advertised_bandwidth: info.advertised_bandwidth ?? 0,
            }),
        )

        return relayData.filter((data, index, array) => data.contact.length > 0)
    }

    public async validateRelays(
        relays: RelayDataDto[],
    ): Promise<ValidationData> {
        const validationStamp = Date.now()
        if (relays.length === 0) {
            this.logger.debug(`No relays to validate at ${validationStamp}`)
            return {
                validated_at: validationStamp,
                relays: [],
            }
        } else {
            const validatedRelays = relays
                .map<ValidatedRelay>((relay, index, array) => ({
                    fingerprint: relay.fingerprint,
                    ator_public_key: this.extractAtorKey(relay.contact),
                    consensus_weight: relay.consensus_weight,
                    observed_bandwidth: relay.observed_bandwidth,
                    running: relay.running,
                }))
                .filter(
                    (relay, index, array) => relay.ator_public_key.length > 0,
                )

            this.logger.log(
                `Storing validation ${validationStamp} with ${validatedRelays.length} relays`,
            )

            const validationData = {
                validated_at: validationStamp,
                relays: validatedRelays,
            }

            this.validationDataModel.create(validationData)

            validatedRelays.forEach(async (relay, index, array) => {
                this.logger.debug(
                    `Storing validation ${validationStamp} of ${relay.fingerprint}`,
                )

                const relayData = relays.find(
                    (value, index, array) =>
                        value.fingerprint == relay.fingerprint,
                )
                if (relayData == undefined) {
                    this.logger.error(
                        `Failed to find relay data for validated relay [${relay.fingerprint}]`,
                    )
                } else {
                    await this.relayDataModel
                        .create<RelayData>({
                            validated_at: validationStamp,
                            fingerprint: relay.fingerprint,
                            ator_public_key: relay.ator_public_key,
                            consensus_weight: relayData.consensus_weight,

                            running: relayData.running,
                            consensus_measured: relayData.consensus_measured,
                            consensus_weight_fraction:
                                relayData.consensus_weight_fraction,
                            version: relayData.version,
                            version_status: relayData.version_status,
                            bandwidth_rate: relayData.bandwidth_rate,
                            bandwidth_burst: relayData.bandwidth_burst,
                            observed_bandwidth: relayData.observed_bandwidth,
                            advertised_bandwidth:
                                relayData.advertised_bandwidth,
                        })
                        .catch((error) => this.logger.error(error))
                }
            })

            return validationData
        }
    }

    public async lastValidationOf(
        fingerprint: string,
    ): Promise<RelayData | null> {
        return this.relayDataModel
            .findOne<RelayData>({ fingerprint: fingerprint })
            .sort({ validated_at: 'desc' })
            .exec()
    }

    public async lastValidation(): Promise<ValidationData | null> {
        return this.validationDataModel
            .findOne<ValidationData>()
            .sort({ validated_at: 'desc' })
            .exec()
    }
}
