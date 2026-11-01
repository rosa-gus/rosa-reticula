import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  const siteUrl = command === 'serve' ? 'http://localhost:5178/' : 'https://rosa-gus.github.io/rosa-reticula/'
  return {
    plugins: [{
      name: 'site-metadata',
      transformIndexHtml: (html: string) => html.replaceAll('__SITE_URL__', siteUrl),
    }],
    base: './',
    server: {
      host: '127.0.0.1',
      port: 5178,
      strictPort: true,
    },
    worker: { format: 'es' },
  }
})
