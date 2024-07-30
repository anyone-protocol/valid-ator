/**
 * Point compress elliptic curve key
 * @param {Uint8Array} x component
 * @param {Uint8Array} y component
 * @return {Uint8Array} Compressed representation
 */
export function ECPointCompress(x: Uint8Array, y: Uint8Array) {
  const out = new Uint8Array(x.length + 1)
  out[0] = 2 + (y[ y.length-1 ] & 1)
  out.set(x, 1)

  return out
}
