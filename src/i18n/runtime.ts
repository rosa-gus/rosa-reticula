import { selectMessage } from '../../shared/i18n/messages.mjs'
import { defaultMessages, catalogLoaders } from './catalog-loaders.generated.ts'
import { supportedLocales, fallbackLocale, matchLocale, resolveLocale, languageNames, type Locale } from '../../shared/i18n/locales.mjs'
import type { MessageParameters, PluralParameters } from './message-parameters.generated.d.ts'

export { supportedLocales, fallbackLocale, matchLocale, resolveLocale, languageNames, type Locale }
type MessageKeys<Value> = {
  [Key in keyof Value & string]: Value[Key] extends string ? Key
    : Value[Key] extends Record<string, unknown> ? `${Key}.${MessageKeys<Value[Key]>}` : never
}[keyof Value & string]
export type MessageKey = MessageKeys<typeof defaultMessages>
export type StaticMessageKey = { [Key in MessageKey]: [MessageParameters[Key]] extends [never] ? Key : never }[MessageKey]
type Arguments<Key extends MessageKey> = [MessageParameters[Key]] extends [never] ? []
  : [values: { [Name in MessageParameters[Key]]: Name extends PluralParameters[Key] ? number : string | number }]
export type Catalog = Record<string, unknown>

export let locale: Locale = fallbackLocale
let messages: Catalog = defaultMessages
let selection = 0
const listeners = new Set<() => void>()
const preferenceKey = 'rosa-reticula:locale:v1'

/** Also usable with explicit catalogs without changing the UI's locale. */
export function createTranslator(catalog: Catalog, fallback: Catalog, language: Locale) {
  return <Key extends MessageKey>(key: Key, ...args: Arguments<Key>): string => {
    for (const [dictionary, messageLocale] of [[catalog, language], [fallback, fallbackLocale]] as const) {
      let value: unknown = dictionary
      for (const part of key.split('.')) value = value && typeof value === 'object' && Object.hasOwn(value, part)
        ? (value as Catalog)[part] : undefined
      if (typeof value !== 'string' || !value.trim()) continue
      const selected = selectMessage(value, args[0], messageLocale, language)
      return selected.text.replace(/\{([^{}]+)\}/g, (_, name: string) => {
        if (!Object.hasOwn(selected.values, name)) throw new Error(`Missing message parameter: ${key}.${name}`)
        return String(selected.values[name])
      })
    }
    throw new Error(`Missing fallback message: ${key}`)
  }
}
export function t<Key extends MessageKey>(key: Key, ...args: Arguments<Key>): string {
  return createTranslator(messages, defaultMessages, locale)(key, ...args)
}
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions, language: Locale = locale): string =>
  new Intl.NumberFormat(language, options).format(value)

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export async function setLocale(next: Locale, options: { persist?: boolean; updateUrl?: boolean } = {}): Promise<void> {
  const request = ++selection
  const catalog = next === fallbackLocale ? defaultMessages : await catalogLoaders[next]()
  if (request !== selection) return
  messages = catalog; locale = next
  updateDocument()
  if (options.persist !== false) {
    try { localStorage.setItem(preferenceKey, next) } catch { /* Optional preference. */ }
  }
  if (options.updateUrl !== false && typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('lang', next)
    window.history.replaceState(window.history.state, '', url)
  }
  listeners.forEach(listener => listener())
}
export async function initializeLocale(): Promise<void> {
  let saved: string | null = null
  try { saved = localStorage.getItem(preferenceKey) } catch { /* Optional preference. */ }
  const query = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('lang')
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  const selected = resolveLocale(query, saved, languages)
  try { await setLocale(selected, { persist: false, updateUrl: false }) }
  catch { await setLocale(fallbackLocale, { persist: false, updateUrl: false }) }
}
function updateDocument(): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = 'ltr'
  document.title = t('metadata.title')
  const social = createTranslator(defaultMessages, defaultMessages, fallbackLocale)
  const metadata = {
    'meta[name="description"]': t('metadata.description'),
    'meta[property="og:locale"]': fallbackLocale.replace('-', '_'),
    'meta[property="og:title"]': social('metadata.title'),
    'meta[property="og:description"]': social('metadata.socialDescription'),
    'meta[name="twitter:title"]': social('metadata.title'),
    'meta[name="twitter:description"]': social('metadata.socialDescription'),
  }
  for (const [selector, content] of Object.entries(metadata)) document.querySelector(selector)?.setAttribute('content', content)
}

/** Update only bindings: canvases, controls, focus, and session state stay mounted. */
export function localize(root: HTMLElement): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) node.textContent = t(node.dataset.i18n as StaticMessageKey)
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    for (const node of root.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`))
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`) as StaticMessageKey))
  }
}
