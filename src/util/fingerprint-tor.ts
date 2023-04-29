import { LengthOfString, HexString } from './hex-string'

export type TorFingerprint<S extends string = ''> = Uppercase<S> & S extends ''
    ? never
    : LengthOfString<S> extends 40
    ? HexString<S>
    : never

declare function onlyTorFingerprint<S extends string>(
    fingerprint: S & TorFingerprint<S>,
): any

// onlyTorFingerprint('AAAAABBBBBCCCCCDDDDDEEEEEFFFFF0000011111')
