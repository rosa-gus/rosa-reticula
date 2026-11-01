import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { tonalBase, screenGray, duotone } from '../src/core/pipeline.ts'
import { gaussianBlur } from '../src/core/blur.ts'
import { pairedRanks } from '../src/core/screens.ts'
import { original, profiles, copyRecipe } from '../src/profiles/registry.ts'
import { parseRecipe, validateParameters } from '../src/profiles/schema.ts'

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/pillow-12.3.0.json', import.meta.url), 'utf8'))
for (const fixture of fixtures.cases) {
  test(`Python parity: ${fixture.name}`, () => {
    const frame = { width: fixture.width, height: fixture.height, rgba: new Uint8ClampedArray(fixture.rgba) }
    const base = tonalBase(frame, original)
    assert.deepEqual([...base], fixture.base, 'tonal base')
    const gray = screenGray(base, frame.width, frame.height, original)
    assert.deepEqual([...gray.gray], fixture.gray, 'treated grayscale')
    const mapped = duotone(gray, original.shadow, original.highlight)
    assert.deepEqual([...mapped.rgba].filter((_, i) => i % 4 !== 3), fixture.rgb, 'duotone')
    for (const [radius, pixels] of Object.entries(fixture.blur)) {
      assert.deepEqual([...gaussianBlur(base, frame.width, frame.height, Number(radius))], pixels, `blur radius ${radius}`)
    }
  })
}
test('paired screen contains every rank exactly once', () => {
  assert.deepEqual([...pairedRanks].sort((a, b) => a - b), Array.from({ length: 256 }, (_, i) => i))
})
test('all built-in profiles survive recipe serialization', () => {
  for (const profile of profiles) assert.deepEqual(parseRecipe(JSON.parse(JSON.stringify(profile))), profile)
})
test('editing a recipe does not mutate its built-in profile', () => {
  const derived = copyRecipe(profiles[0]); derived.parameters.contrast = 2
  assert.equal(profiles[0].parameters.contrast, 1.1)
})
test('rejects unsafe or ambiguous imported parameters', () => {
  for (const patch of [
    { contrast: NaN }, { width: 0 }, { width: 1.5 }, { palette: [0, .5, .5, 1] },
    { palette: [.1, 1] }, { shadows: [0, .5, .2, 1] }, { curve: [[0, 0], [0, 1]] },
    { shadow: '#00000000' }, { signature: [0, 0, 0, 1] },
  ]) assert.throws(() => validateParameters({ ...original, ...patch }))
  assert.throws(() => parseRecipe({ ...profiles[0], algorithm: 'unknown' }))
})
test('zero screen strength preserves the tonal base', () => {
  const base = new Uint8Array(fixtures.cases[1].base)
  assert.deepEqual(screenGray(base, 31, 19, { ...original, screen: 0 }).gray, base)
})
