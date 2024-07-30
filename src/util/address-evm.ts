import { isHexString } from 'ethers'
import { LengthOfString, HexString, UPPER_HEX_CHARS, isHexStringValid } from './hex-string'

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

export function isAddressValid(address?: string) {
    if (!address) { return false }
    if (address.length !== 40) { return false }
    if (!isHexStringValid(address, true)) {
        return false
    }

    return true
}
