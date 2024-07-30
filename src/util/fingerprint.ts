import { LengthOfString, HexString, UPPER_HEX_CHARS } from './hex-string'

export type Fingerprint<S extends string = ''> = Uppercase<S> & S extends ''
  ? never
  : LengthOfString<S> extends 40
  ? HexString<S>
  : never

// onlyFingerprint('AAAAABBBBBCCCCCDDDDDEEEEEFFFFF0000011111')
declare function onlyFingerprint<S extends string>(
  fingerprint: S & Fingerprint<S>,
): any

export function isFingerprintValid(fingerprint?: string) {
  // ContractAssert(!!fingerprint, FINGERPRINT_REQUIRED)
  if (!fingerprint) { return false }  

  // ContractAssert(typeof fingerprint === 'string', INVALID_FINGERPRINT)
  if (typeof fingerprint !== 'string') { return false }

  // ContractAssert(fingerprint.length === 40, INVALID_FINGERPRINT)
  if (fingerprint.length !== 40) { return false}
  
  // ContractAssert(
  //   fingerprint.split('').every(c => UPPER_HEX_CHARS.includes(c)),
  //   INVALID_FINGERPRINT
  // )
  if (!fingerprint.split('').every(c => UPPER_HEX_CHARS.includes(c))) {
    return false
  }

  return true
}
