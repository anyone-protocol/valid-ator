import { LengthOfString, HexString } from './hex-string'

export type EvmAddress<S extends string = ''> = S extends ''
    ? never
    : LengthOfString<S> extends 42
    ? S extends `0x${infer Rest}`
        ? HexString<Rest>
        : never
    : never

declare function onlyEvmAddress<S extends string>(
    address: S & EvmAddress<S>,
): any
// onlyEvmAddress('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
