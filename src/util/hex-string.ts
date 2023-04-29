export type LengthOfString<
    S extends string,
    Acc extends 0[] = [],
> = S extends `${string}${infer $Rest}`
    ? LengthOfString<$Rest, [...Acc, 0]>
    : Acc['length']

type HexNumbers = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

type HexCharsLower = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
type HexCharsUpper = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

type Hex = HexNumbers | HexCharsLower | HexCharsUpper

export type HexString<S> = S extends ''
    ? unknown
    : S extends `${Hex}${infer Rest}`
    ? HexString<Rest>
    : never

declare function onlyHexString<S extends string>(
    hexString: S & HexString<S>,
): any
