import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { imageDimensions, validateInputDimensions } from '../src/browser/image-dimensions.ts'
import { decode } from '../src/browser/image.ts'
import { AppError, InputImageSizeError } from '../src/core/errors.ts'

function jpeg(width: number, height: number): ArrayBuffer {
  // SOI, APP1 metadata, progressive SOF, EOI. Decoder is stubbed where used.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 6, 1, 2, 3, 4,
    0xff, 0xc2, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xd9])
  const view = new DataView(bytes.buffer)
  view.setUint16(15, height); view.setUint16(17, width)
  return bytes.buffer
}
function png(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(33), view = new DataView(bytes.buffer)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13)
  bytes.set(new TextEncoder().encode('IHDR'), 12)
  view.setUint32(16, width); view.setUint32(20, height)
  return bytes.buffer
}
function webp(width: number, height: number, kind: 'VP8X' | 'VP8L' | 'VP8 '): ArrayBuffer {
  const payload = new Uint8Array(kind === 'VP8L' ? 5 : 10), view = new DataView(payload.buffer)
  if (kind === 'VP8X') {
    for (const [offset, value] of [[4, width - 1], [7, height - 1]]) {
      payload[offset] = value & 255; payload[offset + 1] = (value >>> 8) & 255; payload[offset + 2] = (value >>> 16) & 255
    }
  } else if (kind === 'VP8L') {
    payload[0] = 0x2f; view.setUint32(1, (width - 1) | ((height - 1) << 14), true)
  } else {
    payload.set([0x9d, 1, 0x2a], 3); view.setUint16(6, width, true); view.setUint16(8, height, true)
  }
  const bytes = new Uint8Array(20 + payload.length + payload.length % 2), header = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('RIFF'), 0); header.setUint32(4, bytes.length - 8, true)
  bytes.set(new TextEncoder().encode('WEBP' + kind), 8); header.setUint32(16, payload.length, true); bytes.set(payload, 20)
  return bytes.buffer
}

test('preflight reads JPEG dimensions past metadata without decoding pixels', () => {
  assert.deepEqual(imageDimensions(jpeg(7952, 5304)), { width: 7952, height: 5304 })
  for (const filename of ['patricio-gaibor.jpg', 'mehdi-imani.jpg']) {
    const bytes = readFileSync(new URL(`../src/assets/examples/${filename}`, import.meta.url))
    const dimensions = imageDimensions(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    assert.ok(dimensions.width > 1000 && dimensions.height > 1000)
    assert.doesNotThrow(() => validateInputDimensions(dimensions))
  }
})
test('preflight supports PNG and all three WebP dimension headers', () => {
  for (const buffer of [png(7952, 5304), ...(['VP8X', 'VP8L', 'VP8 '] as const).map(kind => webp(7952, 5304, kind))])
    assert.deepEqual(imageDimensions(buffer), { width: 7952, height: 5304 })
})
test('preflight rejects missing, truncated, and invalid dimension headers', () => {
  for (const buffer of [new ArrayBuffer(0), jpeg(1, 1).slice(0, 17), png(0, 2), webp(20, 20, 'VP8X').slice(0, 25)])
    assert.throws(() => imageDimensions(buffer), (error: unknown) => error instanceof AppError && error.code === 'decode')
})
test('60 MP is accepted, while excess pixels carry the detected dimensions', () => {
  assert.doesNotThrow(() => validateInputDimensions({ width: 10000, height: 6000 }))
  assert.doesNotThrow(() => validateInputDimensions({ width: 7952, height: 5304 }))
  assert.throws(() => validateInputDimensions({ width: 10000, height: 6001 }), (error: unknown) =>
    error instanceof InputImageSizeError && error.width === 10000 && error.height === 6001)
})
test('decode rejects oversized input before invoking the browser decoder', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
  let calls = 0
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => { calls++; throw new Error('decoder must not run') } })
  try {
    for (const [buffer, type] of [[jpeg(10000, 6001), 'image/jpeg'], [png(10000, 6001), 'image/png'], [webp(10000, 6001, 'VP8X'), 'image/webp']] as const)
      await assert.rejects(decode(new File([buffer], 'oversized', { type })), InputImageSizeError)
    await assert.rejects(decode(new File([new Uint8Array(30 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })), (error: unknown) => error instanceof AppError && error.code === 'fileSize')
    assert.equal(calls, 0)
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original)
    else delete (globalThis as Record<string, unknown>).createImageBitmap
  }
})
test('decode accepts a 42 MP image and still checks the decoded dimensions', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
  let closed = false
  let bitmap = { width: 7952, height: 5304, close: () => { closed = true } }
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => bitmap })
  try {
    const file = new File([jpeg(7952, 5304)], 'photo.jpg', { type: 'image/jpeg' })
    assert.equal(await decode(file), bitmap)
    assert.equal(closed, false)
    bitmap = { width: 10000, height: 6001, close: () => { closed = true; bitmap.width = 0; bitmap.height = 0 } }
    await assert.rejects(decode(file), (error: unknown) => error instanceof InputImageSizeError && error.width === 10000 && error.height === 6001)
    assert.equal(closed, true)
  } finally {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original)
    else delete (globalThis as Record<string, unknown>).createImageBitmap
  }
})
