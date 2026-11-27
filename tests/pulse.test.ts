import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { defaultPulse, createLightField, lightMask, illuminate, pulseLevel, animationPlan, validatePulse } from '../src/core/pulse.ts'
import { GifEncoder } from '../src/processing/gif.ts'
import { AppError } from '../src/core/errors.ts'

// Generated files were independently decoded with Pillow 12.3.0: every pixel,
// all frame delays, and the infinite repeat flag matched before these hashes were recorded.
import gifFixtures from './fixtures/pulse-gif.json' with { type: 'json' }

test('pulsation changes a circular region and preserves pixels outside the light', () => {
  const width = 80, height = 40
  const p = { ...defaultPulse, model: "point" as const, minimum: 0, intensity: 1, radius: 0.25 }
  const base = new Uint8Array(width * height).fill(80)
  const mask = lightMask(width, height, p)
  const peak = illuminate(base, mask, p, 0.5 / p.frequency)
  assert.equal(peak[0], 80)
  assert.ok(peak[20 * width + 40] > 250)
  assert.equal(mask[20 * width + 50], 0)
  assert.equal(mask[30 * width + 40], 0)
  assert.equal(mask[20 * width + 45], mask[25 * width + 40])
  assert.deepEqual(illuminate(base, mask, p, 0), base)
  assert.deepEqual(base, new Uint8Array(width * height).fill(80), 'source is immutable')
  const dark = illuminate(base, mask, { ...p, polarity: 'dark' }, 0.5 / p.frequency)
  assert.ok(dark[20 * width + 40] < 2)
  assert.equal(dark[0], 80)
})

test('all pulse curves repeat exactly, with configurable floor and peak', () => {
  for (const curve of ['breath', 'beat', 'triangle'] as const) {
    const p = { ...defaultPulse, curve }
    assert.ok(Math.abs(pulseLevel(p, 0) - p.intensity * p.minimum) < 1e-12)
    assert.ok(Math.abs(pulseLevel(p, 0.5 / p.frequency) - p.intensity) < 1e-12)
    for (const phase of [0, 0.125, 0.5, 0.75, 1]) {
      assert.ok(Math.abs(pulseLevel(p, phase / p.frequency) - pulseLevel(p, (phase + 1) / p.frequency)) < 1e-12)
    }
  }
})

test('animation plans close complete cycles and distribute GIF timing to centiseconds', () => {
  for (const frequency of [0.2, 0.35, 0.5, 1.7, 3]) {
    for (const fps of [12, 24, 30]) {
      const p = { ...defaultPulse, frequency }
      const mp4 = animationPlan(p, 2, fps, 'mp4')
      assert.equal(mp4.duration, 2 / frequency)
      const gif = animationPlan(p, 2, fps, 'gif')
      let total = 0
      for (let i = 0; i < gif.frames; i++) {
        const delay = Math.round((i + 1) * gif.frameDuration * 100) - Math.round(i * gif.frameDuration * 100)
        assert.ok(delay >= 2)
        total += delay
      }
      assert.equal(total, Math.round(2 / frequency * 100))
      assert.ok((gif.frames - 1) * gif.frameDuration < gif.duration)
    }
  }
})

test('invalid animation values are rejected before worker allocation', () => {
  for (const patch of [{ frequency: 0 }, { x: NaN }, { radius: Infinity }, { intensity: 2 }, { minimum: -1 }])
    assert.throws(() => validatePulse({ ...defaultPulse, ...patch }), AppError)
  assert.throws(() => animationPlan(defaultPulse, 1.5, 24, 'gif'), AppError)
  assert.throws(() => animationPlan(defaultPulse, 2, 60, 'mp4'), AppError)
})

test('GIF89a preserves indexed duotone frames across LZW code-size changes and dictionary resets', () => {
  for (const { width, height, sha256 } of gifFixtures) {
    const gif = new GifEncoder(width, height, '#132539', '#f7d591')
    let seed = 42
    for (let frame = 0; frame < 3; frame++) {
      const data = Uint8Array.from({ length: width * height }, (_, i) => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return frame === 0 ? seed >>> 24 : frame === 1 ? i % 256 : 127
      })
      gif.writeFrame(data, [4, 5, 4][frame])
    }
    const bytes = new Uint8Array(gif.finish())
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), 'GIF89a')
    assert.equal(bytes.at(-1), 0x3b)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256)
    assert.throws(() => gif.writeFrame(new Uint8Array(width * height), 4), AppError)
  }
})

test('GIF rejects malformed frames and delays', () => {
  assert.throws(() => new GifEncoder(0, 1, '#000000', '#ffffff'), AppError)
  const gif = new GifEncoder(2, 2, '#000000', '#ffffff')
  assert.throws(() => gif.writeFrame(new Uint8Array(3), 4), AppError)
  assert.throws(() => gif.writeFrame(new Uint8Array(4), 1), AppError)
})

test('organic light is deterministic, irregular, and evolves throughout the canvas', () => {
  const width = 96, height = 64
  const field = createLightField(width, height, defaultPulse)
  const first = field(0, 4).slice(), later = field(1.3, 4).slice()
  assert.deepEqual(first, createLightField(width, height, { ...defaultPulse })(0, 4))
  assert.notDeepEqual(first, createLightField(width, height, { ...defaultPulse, seed: 2 })(0, 4))
  // Each quadrant has its own variation and movement, including the outer regions.
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    let min = 1, max = 0, change = 0
    for (let y = (quadrant >> 1) * height / 2; y < ((quadrant >> 1) + 1) * height / 2; y++) {
      for (let x = (quadrant % 2) * width / 2; x < ((quadrant % 2) + 1) * width / 2; x++) {
        const i = y * width + x
        min = Math.min(min, first[i]); max = Math.max(max, first[i])
        change += Math.abs(first[i] - later[i])
        assert.ok(first[i] >= 0 && first[i] <= 1)
      }
    }
    assert.ok(max - min > 0.4, `quadrant ${quadrant} lacks spatial variation`)
    assert.ok(change / (width * height / 4) > 0.05, `quadrant ${quadrant} is static`)
  }
  let reflectedDifference = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      reflectedDifference += Math.abs(first[y * width + x] - first[y * width + width - x - 1])
  assert.ok(reflectedDifference / first.length > 0.1, 'field must not be radially symmetric')
  assert.deepEqual(first, createLightField(width, height, { ...defaultPulse, x: 0, y: 0, radius: 0.05 })(0, 4), 'organic light has no point-light center or radius')
})

test('organic movement and local pulses are continuous across the complete export loop', () => {
  const averageDifference = (a: Float32Array, b: Float32Array) => a.reduce((total, value, i) => total + Math.abs(value - b[i]), 0) / a.length
  for (const seed of [0, 1, 4294967295]) {
    for (const cycles of [1, 2, 6]) {
      const p = { ...defaultPulse, seed, frequency: 0.35 }
      const duration = cycles / p.frequency, field = createLightField(48, 32, p)
      const first = field(0, duration).slice()
      const end = field(duration, duration).slice()
      assert.ok(averageDifference(first, end) < 1e-6)
      const before = field(duration - 0.0001, duration).slice()
      const after = field(0.0001, duration).slice()
      assert.ok(averageDifference(before, after) < 0.001, 'loop boundary must not jump')
    }
  }
})

test('organic controls independently affect motion, detail, and local illumination', () => {
  const width = 48, height = 32
  const first = createLightField(width, height, defaultPulse)(0.7, 4).slice()
  for (const patch of [{ speed: 1.5 }, { scale: 0.15 }, { complexity: 0 }, { pulsation: 0 }])
    assert.notDeepEqual(first, createLightField(width, height, { ...defaultPulse, ...patch })(0.7, 4), JSON.stringify(patch))
  const frozen = createLightField(width, height, { ...defaultPulse, speed: 0, pulsation: 0 })
  assert.deepEqual(frozen(0, 4).slice(), frozen(1.7, 4))
  const base = new Uint8Array(width * height).fill(80)
  const mask = createLightField(width, height, defaultPulse)(0, 4)
  const lit = illuminate(base, mask, defaultPulse, 0)
  assert.ok(Math.max(...lit) - Math.min(...lit) > 50, 'local phases must not black out the entire field at phase zero')
  assert.deepEqual(illuminate(base, mask, { ...defaultPulse, intensity: 0 }, 0), base)
  const dark = illuminate(base, mask, { ...defaultPulse, polarity: 'dark' }, 0)
  assert.ok(dark.every((value) => value <= 80))
})

test('organic sampler handles tiny images, seeds, and parameter bounds', () => {
  for (const [width, height] of [[1, 1], [1, 17], [17, 1], [7, 13]]) {
    const field = createLightField(width, height, { ...defaultPulse, scale: 0.08, complexity: 1 })
    const mask = field(0.4, 4)
    assert.equal(mask.length, width * height)
    assert.ok(mask.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
  }
  for (const patch of [{ seed: -1 }, { seed: 1.5 }, { seed: 4294967296 }, { speed: NaN }, { scale: 0 }, { complexity: 2 }, { pulsation: -1 }])
    assert.throws(() => validatePulse({ ...defaultPulse, ...patch }), AppError)
  assert.throws(() => validatePulse({ ...defaultPulse, model: 'invalid' } as unknown as typeof defaultPulse), AppError)
})
