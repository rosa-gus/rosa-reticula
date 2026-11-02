import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { mergeCatalogs, validateTranslation, flattenCatalog, messageCoverage, renderMessageTypes, validateLocaleDirectories } from '../scripts/generate_locale_types.mjs'
import { defaultMessages, catalogLoaders } from '../src/i18n/catalog-loaders.generated.ts'
import { resolveLocale, matchLocale, createTranslator, t, setLocale, locale, subscribeLocale, formatNumber, escapeHtml } from '../src/i18n/runtime.ts'
import { errorMessage, workerError } from '../src/i18n/errors.ts'
import { AppError, InputImageSizeError } from '../src/core/errors.ts'
import { original, profiles } from '../src/profiles/registry.ts'
import { validateParameters } from '../src/profiles/schema.ts'

const catalog = (language: string) => {
  const directory = new URL(`../src/i18n/locales/${language}/`, import.meta.url)
  return mergeCatalogs(readdirSync(directory).map(filename => ({ filename, source: readFileSync(new URL(filename, directory), 'utf8') })))
}

test('locale selection follows query, saved preference, browser languages, then English', () => {
  assert.equal(resolveLocale('pt', 'en-US', ['en-US']), 'pt-BR')
  assert.equal(resolveLocale('fr', 'pt-BR', ['en-US']), 'pt-BR')
  assert.equal(resolveLocale(null, 'invalid', ['de-DE', 'pt-PT']), 'pt-BR')
  assert.equal(resolveLocale(null, null, ['fr-FR']), 'en-US')
  assert.equal(matchLocale('EN-us'), 'en-US')
  assert.equal(matchLocale('not_a_locale'), null)
})

test('committed catalogs have complete own coverage and compatible contracts', () => {
  const en = catalog('en-US'), pt = catalog('pt-BR')
  validateTranslation(en, pt)
  const coverage = messageCoverage(en, pt)
  assert.equal(coverage.translated, coverage.total)
  assert.deepEqual(flattenCatalog(defaultMessages), flattenCatalog(en))
})

test('per-message fallback preserves selected number formatting and message plural rules', () => {
  const translate = createTranslator({ workbench: { title: 'Título', open: ' ' } }, defaultMessages, 'pt-BR')
  assert.equal(translate('workbench.title'), 'Título')
  assert.equal(translate('workbench.open'), '[Open image]')
  // Portuguese treats 0 as one; the fallback message must use English's other.
  assert.equal(translate('profiles.levels', { count: 0 }), '0 levels')
  assert.equal(translate('profiles.levels', { count: 1234 }), '1.234 levels')
  assert.throws(() => createTranslator({}, {}, 'pt-BR')('workbench.title'), /Missing fallback/)
})

test('catalog validator rejects blanks, duplicates, unknown keys, markup, and changed parameters', () => {
  assert.throws(() => mergeCatalogs([{ filename: 'x.json', source: '{"x":{"a":"One","a":"Two"}}' }]), /duplicate/)
  assert.throws(() => mergeCatalogs([{ filename: 'x.json', source: '{"x":{"a":"One","\\u0061":"Two"}}' }]), /duplicate/)
  assert.throws(() => validateTranslation(defaultMessages, { workbench: { title: '' } }), /Empty/)
  assert.throws(() => validateTranslation(defaultMessages, { workbench: { unknown: 'Text' } }), /Unknown/)
  assert.throws(() => validateTranslation(defaultMessages, { workbench: { title: '<script>Text</script>' } }), /wrapper/)
  assert.throws(() => validateTranslation(defaultMessages, { preview: { originalSize: '{width}' } }), /parameters/)
  assert.throws(() => renderMessageTypes('{"x":{"a":"{count, plural, one {item}}"}}'), /Malformed/)
  assert.throws(() => validateLocaleDirectories(['en-US', 'fr-FR'], 'app'), /locale directories/)
})

test('translation parameters remain literal text and escaping protects template attributes', () => {
  const translate = createTranslator({}, defaultMessages, 'en-US')
  const value = '<img src=x onerror="alert(1)">{width}'
  assert.equal(translate('errors.previousImage', { message: value }), `${value} Previous image retained.`)
  assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;')
})

test('locale changes persist only when requested, update the URL, and preserve processing data', async () => {
  const before = JSON.stringify(profiles)
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const writes: unknown[] = [], urls: unknown[] = []
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (...args: unknown[]) => writes.push(args) } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'http://localhost/?keep=yes#preview' }, history: { state: null, replaceState: (...args: unknown[]) => urls.push(args[2]) } } })
  let notifications = 0
  const unsubscribe = subscribeLocale(() => notifications++)
  try {
    await setLocale('pt-BR', { persist: false, updateUrl: false })
    assert.equal(locale, 'pt-BR')
    assert.equal(t('workbench.open'), '[Abrir imagem]')
    assert.equal(t('profiles.levels', { count: 1 }), '1 nível')
    assert.equal(formatNumber(1.1, { minimumFractionDigits: 2 }), '1,10')
    assert.deepEqual(writes, [])
    assert.deepEqual(urls, [])
    await setLocale('en-US')
    assert.deepEqual(writes, [['rosa-reticula:locale:v1', 'en-US']])
    assert.equal(String(urls[0]), 'http://localhost/?keep=yes&lang=en-US#preview')
    assert.equal(notifications, 2)
    assert.equal(JSON.stringify(profiles), before)
    assert.deepEqual(validateParameters(original), original)
  } finally {
    unsubscribe()
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete (globalThis as Record<string, unknown>).localStorage
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete (globalThis as Record<string, unknown>).window
    await setLocale('en-US', { persist: false, updateUrl: false })
  }
})

test('latest language selection wins when lazy loading resolves late', async () => {
  const originalLoader = catalogLoaders['pt-BR']
  let release!: (value: Awaited<ReturnType<typeof originalLoader>>) => void
  const pt = await originalLoader()
  catalogLoaders['pt-BR'] = () => new Promise(resolve => { release = resolve })
  try {
    const pending = setLocale('pt-BR', { persist: false, updateUrl: false })
    await setLocale('en-US', { persist: false, updateUrl: false })
    release(pt); await pending
    assert.equal(locale, 'en-US')
  } finally { catalogLoaders['pt-BR'] = originalLoader }
})

test('known errors translate in the UI; unknown diagnostics never leak', async () => {
  await setLocale('pt-BR', { persist: false, updateUrl: false })
  try {
    assert.equal(errorMessage(new AppError('fileSize')), 'O arquivo deve ter no máximo 30 MB.')
    assert.equal(errorMessage(new Error('internal diagnostic')), 'Não foi possível concluir esta operação.')
    assert.equal(workerError('untrusted').code, 'processing')
    assert.throws(() => validateParameters({ ...original, width: 0 }), (error: unknown) => error instanceof AppError && error.code === 'recipeWidth')
  } finally { await setLocale('en-US', { persist: false, updateUrl: false }) }
})

test('oversized image errors show dimensions and the megapixel limit in both locales', async () => {
  const error = new InputImageSizeError(10000, 6001)
  try {
    await setLocale('pt-BR', { persist: false, updateUrl: false })
    assert.equal(errorMessage(error), 'Esta imagem tem 10.000 × 6.001 pixels (60,01 MP) e excede o limite de 60 MP. Reduza as dimensões da imagem e tente novamente.')
    await setLocale('en-US', { persist: false, updateUrl: false })
    assert.equal(errorMessage(error), 'This image is 10,000 × 6,001 pixels (60.01 MP) and exceeds the 60 MP limit. Reduce the image dimensions and try again.')
  } finally { await setLocale('en-US', { persist: false, updateUrl: false }) }
})
