import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { HardwareVerificationService } from './hardware-verification.service'
import {
  VerifiedHardware,
  VerifiedHardwareSchema
} from './schemas/verified-hardware'
import { RelaySaleData, RelaySaleDataSchema } from './schemas/relay-sale-data'

describe('HardwareVerificationService', () => {
  let module: TestingModule
  let service: HardwareVerificationService

  beforeEach(async () => {
    const dbName = 'validator-hardware-verification-service-tests'

    module = await Test.createTestingModule({
      imports: [
          ConfigModule.forRoot(),
          MongooseModule.forRoot(`mongodb://localhost/${dbName}`),
          MongooseModule.forFeature([
            { name: VerifiedHardware.name, schema: VerifiedHardwareSchema },
            { name: RelaySaleData.name, schema: RelaySaleDataSchema },
          ]),
      ],
      providers: [HardwareVerificationService],
  }).compile()

  service = module.get<HardwareVerificationService>(HardwareVerificationService)
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should check owner of valid nft id', async () => {
    const address = '0xe96caef5e3b4d6b3F810679637FFe95D21dEFa5B'
    const nftId = BigInt(621)

    const isOwnerOfRelayupNft = await service.isOwnerOfRelayupNft(
      address,
      nftId
    )

    expect(isOwnerOfRelayupNft).toBe(true)
  })

  it('should check owner of invalid nft id', async () => {
    const address = '0xe96caef5e3b4d6b3F810679637FFe95D21dEFa5B'
    const nftId = BigInt(999)

    const isOwnerOfRelayupNft = await service.isOwnerOfRelayupNft(
      address,
      nftId
    )

    expect(isOwnerOfRelayupNft).toBe(false)
  })

  it('should validate hardware serial proofs', async () => {
    const nodeId = 'relay'
    const nftId = 0
    const deviceSerial = 'c2eeefaa42a50073'
    const atecSerial = '01237da6e721fcee01'
    const fingerprint = '6CF7AA4F7C8DABCF523DC1484020906C0E0F7A9C'
    const address = '01FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF02'
    const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    const signature = 'e84dad1da3bbc25e60d3e54676ad1610172a2239bb571db9031dd8ca1973c4bab68b23f9a94ecab9396433499333963889f4ebcce79e3f219dab93956b4719ef'

    const result = await service.verifyRelaySerialProof(
      nodeId,
      nftId,
      deviceSerial,
      atecSerial,
      fingerprint,
      address,
      publicKey,
      signature
    )

    expect(result).toBe(true)
  })
})
