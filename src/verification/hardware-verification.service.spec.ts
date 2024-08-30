import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { HardwareVerificationService } from './hardware-verification.service'
import {
  VerifiedHardware,
  VerifiedHardwareSchema
} from './schemas/verified-hardware'
import { RelaySaleData, RelaySaleDataSchema } from './schemas/relay-sale-data'
import {
  HardwareVerificationFailure,
  HardwareVerificationFailureSchema
} from './schemas/hardware-verification-failure'

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
            {
              name: HardwareVerificationFailure.name,
              schema: HardwareVerificationFailureSchema
            }
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
    // tbs_digest: 72656c61790000c2eeefaa42a5007301237da6e721fcee0189a5ef566c85e88391886220f7439dedd967ef626d456e61876334ee2ca473e3b4b66777c931886e
    // tbs_digest_sha256: 7613148017599b032f14a5aacc6a8643642aafdc075cccc7e56573673d20bf4e
    // Signature: 8f91a418bbd6e9d2f0e73a987957e686c6373f13c7560520b84813dc25959b636b785054cc4751cd062214db8ffba1462634fa8001e4b4b725cbbfcc0bf6b653
    // Public-Key: 8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb
    // Signature verified: 1

    // const nftId = 0
    // const deviceSerial = 'c2eeefaa42a50073'
    // const atecSerial = '01237da6e721fcee01'
    // const fingerprint = '6CF7AA4F7C8DABCF523DC1484020906C0E0F7A9C'
    // const address = '0x01FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF02'
    // const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    // const signature = 'e84dad1da3bbc25e60d3e54676ad1610172a2239bb571db9031dd8ca1973c4bab68b23f9a94ecab9396433499333963889f4ebcce79e3f219dab93956b4719ef'
    // const signature = 'ec6fe2876f959bcdd1df819bde3617667edd62e8fffba5f645fe86eae4602766830199fef0f449b750ae92f9f2f87a2232af7f3bd62986810d8b0d4df6081446'

    // const nftId = 49
    // const deviceSerial = 'd27c4beb70f6250d'
    // const atecSerial = '0123b5bbd2261b5701'
    // const fingerprint = 'A786266527B9757D5B1639B045C34EC8FB597396'
    // const address = '0x6D454e61876334ee2Ca473E3b4B66777C931886E'
    // const publicKey = '388ce1d5c1352313c43a4cdd6443d65f087ade8724b48103eee2478a29bfdf64177f32973eb30f611f0d4fc39db7e8413a2e53e4fa2a90b8ad92949e195f409c'
    // const signature = '634c6dece6ed02bb3979c6433880cd63c88b9e53e4a06f9147ef8f14013a3cfb3b6323436cfe36c4f6d3630eb2d7da8c6e3345790b57ac6755d37b13f715e76e'

    // const nftId = 0
    // const deviceSerial = 'c2eeefaa42a50073'
    // // const deviceSerial = 'c2eeef8a42a50073'
    // const atecSerial = '01237da6e721fcee01'
    // // const atecSerial = '01237da6e721dcce01'
    // const fingerprint = '89A5EF566C85E88391886220F7439DEDD967EF62'
    // // const address = '0x6D454e61876334ee2Ca473E3b4B66777C931886E'
    // const address = '0x6D456e61876334ee2Ca473E3b4B66777C931886E'
    // const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    // const signature = '8f91a418bbd6e9d2f0e73a987957e686c6373f13c7560520b84813dc25959b636b785054cc4751cd062214db8ffba1462634fa8001e4b4b725cbbfcc0bf6b653'

    const nftId = 0
    const deviceSerial = 'c2eeef8a42a50073'
    const atecSerial = '01237da6e721dcce01'
    const fingerprint = '89A5EF566C85E88391886220F7439DEDD967EF62'
    const address = '0x6d454e61876334ee2ca473e3b4b66777c931886e'
    const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    const signature = 'f9fd49a43376f7dae87c2c95f14553feec317e93967db97bdcf7b5232616d551167555f90173bf6178f7e8a2aa71834932dbcdff26f0ae26b88c00cb0d09f174'

    const result = await service.verifyRelaySerialProof(
      'relay',
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
