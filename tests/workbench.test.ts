import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'
import { defaultMessages } from '../src/i18n/catalog-loaders.generated.ts'
import { flattenCatalog } from '../scripts/generate_locale_types.mjs'
import { localize, setLocale } from '../src/i18n/runtime.ts'

// Match Vite's ?raw import when running DOM tests directly in Node.
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/workbench.html?raw')) {
      return { format: 'module', source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
const { mountWorkbench } = await import('../src/ui/workbench.ts')
hooks.deregister()

function mountedWorkbench() {
  const { document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const root = document.querySelector('#root')!
  mountWorkbench(root as unknown as HTMLElement)
  return root
}

test('HTML template mounts translated controls, metadata, and reusable help panels', () => {
  const root = mountedWorkbench()
  for (const id of ['language', 'profile', 'curve', 'export-format'])
    assert.equal(root.querySelector(`#${id}`)?.tagName, 'SELECT')
  assert.equal(root.querySelector('#curve option[value="linear"]')?.textContent, 'Linear')
  assert.equal(root.querySelector('#export-label')?.textContent, 'Export PNG')
  assert.equal(root.querySelector('#select-image')?.textContent.trim(), '[Open image]')
  assert.equal(root.querySelector('#result-canvas')?.getAttribute('aria-label'), 'Treated image')
  const info = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(root.querySelector('.brand-version')?.textContent, `v${info.version}`)
  assert.equal(root.querySelector('[data-license]')?.textContent, info.license)
  assert.equal(root.querySelector('[data-brand-image]')?.getAttribute('src'), './rosa-reticula-brand.png')
  assert.equal(root.querySelectorAll('#tone-controls input[type="range"]').length, 4)
  assert.equal(root.querySelectorAll('.advanced input[type="range"]').length, 1)
  assert.equal(root.querySelectorAll('.tooltip-trigger').length, 6)
  assert.equal(root.querySelectorAll('template').length, 0)
  assert.equal(root.querySelectorAll('option span').length, 0)
  for (const id of ['contrast', 'screen', 'pairs', 'protection', 'blur']) {
    const input = root.querySelector(`#${id}`)!
    assert.equal(input.getAttribute('data-param'), id)
    assert.equal(input.getAttribute('aria-describedby'), `${id}-help`)
    assert.ok(root.querySelector(`label[for="${id}"]`)?.textContent)
    assert.ok(root.querySelector(`#${id}-value[for="${id}"]`))
  }
})

test('template IDs and accessibility references satisfy the controller contract', () => {
  const root = mountedWorkbench()
  const ids = [...root.querySelectorAll('[id]')].map(node => node.id)
  assert.equal(new Set(ids).size, ids.length, 'Duplicate element IDs')
  const controller = readFileSync(new URL('../src/app/controller.ts', import.meta.url), 'utf8')
  for (const match of controller.matchAll(/\bel(?:<\w+>)?\("([\w-]+)"\)/g))
    assert.ok(root.querySelector(`#${match[1]}`), `Missing controller element: ${match[1]}`)
  for (const node of root.querySelectorAll('[for], [aria-describedby], [aria-labelledby], [aria-controls], [popovertarget]')) {
    for (const attribute of ['for', 'aria-describedby', 'aria-labelledby', 'aria-controls', 'popovertarget']) {
      for (const id of (node.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean))
        assert.ok(root.querySelector(`#${id}`), `Missing ${attribute} target: ${id}`)
    }
  }
})

test('all HTML translation keys exist and language changes preserve controls and values', async () => {
  const root = mountedWorkbench()
  const messages = flattenCatalog(defaultMessages)
  for (const node of root.querySelectorAll('*')) {
    for (const attribute of node.attributes) {
      if (attribute.name === 'data-i18n' || attribute.name.startsWith('data-i18n-'))
        assert.ok(Object.hasOwn(messages, attribute.value), `Unknown translation: ${attribute.value}`)
    }
  }
  const canvas = root.querySelector('#result-canvas')!
  const contrast = root.querySelector('#contrast')!
  contrast.setAttribute('value', '1.7')
  const format = root.querySelector('#export-format')!
  format.querySelector('[value="webp"]')!.setAttribute('selected', '')
  await setLocale('pt-BR', { persist: false, updateUrl: false })
  try {
    localize(root as unknown as HTMLElement)
    assert.equal(root.querySelector('#select-image')?.textContent.trim(), '[Abrir imagem]')
    assert.equal(root.querySelector('#contrast-help .tooltip-title')?.textContent, 'Contraste')
    assert.equal(root.querySelector('#result-canvas'), canvas)
    assert.equal(root.querySelector('#contrast'), contrast)
    assert.equal(contrast.getAttribute('value'), '1.7')
    assert.equal(root.querySelector('#export-format'), format)
    assert.ok(format.querySelector('[value="webp"]')?.hasAttribute('selected'))
  } finally {
    await setLocale('en-US', { persist: false, updateUrl: false })
  }
})
