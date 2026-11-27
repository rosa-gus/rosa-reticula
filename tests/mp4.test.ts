import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canEncodeVideo, Quality } from 'mediabunny'
import { AppError } from '../src/core/errors.ts'
import { mp4RateControl } from '../src/processing/mp4.ts'

async function probe(width: number, accept: (config: VideoEncoderConfig) => boolean) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder')
  const attempts: VideoEncoderConfig[] = []
  // Exercise Mediabunny's real capability negotiation with controlled browser
  // responses. This checks fallback behavior without comparing media files.
  Object.defineProperty(globalThis, 'VideoEncoder', {
    configurable: true,
    value: class {
      static async isConfigSupported(config: VideoEncoderConfig) {
        attempts.push(config)
        return { supported: accept(config), config }
      }
    },
  })
  try {
    const supported = await canEncodeVideo('avc', {
      width, height: 242, frameRate: 24,
      quality: new Quality(mp4RateControl(width, 242, 24)),
      latencyMode: 'quality', contentHint: 'detail',
    })
    return { supported, attempts }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'VideoEncoder', previous)
    else delete (globalThis as Record<string, unknown>).VideoEncoder
  }
}

test('MP4 prefers quantizer control when the browser supports it', async () => {
  const { supported, attempts } = await probe(322, config => config.bitrateMode === 'quantizer')
  assert.equal(supported, true)
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].bitrateMode, 'quantizer')
  assert.equal(attempts[0].latencyMode, 'quality')
  assert.equal(attempts[0].contentHint, 'detail')
})

test('MP4 negotiates the explicit high-bitrate fallback when quantizer control is unavailable', async () => {
  const { supported, attempts } = await probe(324, config => config.bitrateMode === 'variable')
  assert.equal(supported, true)
  assert.equal(attempts.length, 2)
  assert.equal(attempts[0].bitrateMode, 'quantizer')
  assert.equal(attempts[1].bitrateMode, 'variable')
  assert.equal(attempts[1].bitrate, mp4RateControl(324, 242, 24).bitrate)
  assert.equal(attempts[1].framerate, 24)
  assert.equal(attempts[1].latencyMode, 'quality')
  assert.equal(attempts[1].contentHint, 'detail')
})

test('unsupported MP4 encoding is reported after both rate-control methods are checked', async () => {
  const { supported, attempts } = await probe(326, () => false)
  assert.equal(supported, false)
  assert.equal(attempts.length, 2)
})

test('MP4 fallback scales with resolution and effective frame rate while respecting bounds', () => {
  const normal = mp4RateControl(2000, 1334, 24)
  assert.ok(mp4RateControl(1000, 668, 24).bitrate < normal.bitrate)
  assert.equal(mp4RateControl(2000, 1334, 48).bitrate, normal.bitrate * 2)
  assert.ok(mp4RateControl(2000, 1334, 24.5).bitrate > normal.bitrate)
  assert.equal(mp4RateControl(2, 2, 12).bitrate, 4_000_000)
  assert.equal(mp4RateControl(4096, 4096, 30).bitrate, 160_000_000)
  for (const [width, height, fps] of [[0, 2, 24], [2, 0, 24], [1.5, 2, 24], [2, 2, NaN], [2, 2, 0]])
    assert.throws(() => mp4RateControl(width, height, fps), AppError)
})
