import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { simd } from 'wasm-feature-detect'
import { init as initEncoder } from '@jsquash/webp/encode.js'
import decode, { init as initDecoder } from '@jsquash/webp/decode.js'
import { encodeLosslessWebp } from '../src/processing/webp.ts'
import { imageDimensions } from '../src/browser/image-dimensions.ts'

test('lossless WebP round trip preserves every RGBA channel, including dither and transparent pixels', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ImageData')
  // The WASM decoder needs this browser value object in Node.
  Object.defineProperty(globalThis, 'ImageData', {
    configurable: true,
    value: class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
      }
    },
  })
  try {
    const encoder = await simd() ? 'webp_enc_simd' : 'webp_enc'
    await initEncoder({ wasmBinary: readFileSync(new URL(`../node_modules/@jsquash/webp/codec/enc/${encoder}.wasm`, import.meta.url)) })
    await initDecoder({ wasmBinary: readFileSync(new URL('../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm', import.meta.url)) })
    for (const [width, height, transparent] of [[32, 32, false], [17, 9, true]] as const) {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let pixel = 0; pixel < width * height; pixel++) {
        const offset = pixel * 4
        const ink = (pixel + Math.floor(pixel / width)) % 2 === 0
        data.set(ink ? [27, 43, 79, 255] : [241, 194, 127, 255], offset)
        if (transparent) data.set([pixel % 256, (pixel * 37) % 256, (pixel * 79) % 256, pixel % 3 === 0 ? 0 : 127], offset)
      }
      const buffer = await encodeLosslessWebp({ data, width, height } as ImageData)
      assert.equal(new TextDecoder().decode(buffer.slice(0, 4)), 'RIFF')
      assert.equal(new TextDecoder().decode(buffer.slice(8, 12)), 'WEBP')
      assert.deepEqual(imageDimensions(buffer), { width, height })
      const decoded = await decode(buffer)
      assert.equal(decoded.width, width)
      assert.equal(decoded.height, height)
      assert.deepEqual(decoded.data, data)
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'ImageData', previous)
    else delete (globalThis as Record<string, unknown>).ImageData
  }
})
