<p align="center">
  <img src="public/rosa-reticula-brand.png" alt="Rosa Retícula" width="96" height="96">
</p>

# Rosa Retícula

A browser-based image workbench for Rosa Retícula: Bayer-inspired ordered dithering, selective screening, and duotone mapping. Adjust treatment parameters, save profiles, and export PNG images or reusable JSON recipes. All image processing runs locally in your browser.

## Development

Requires Node.js 24.12+ and Yarn 1.22.22.

```sh
yarn install --frozen-lockfile
yarn dev
```

The development server runs at `http://localhost:5178/`.

```sh
yarn test     # Run tests and validate translations
yarn build    # Type-check and build into dist/
yarn preview  # Preview the production build
```

The app uses TypeScript, Vite, Canvas, and a Web Worker. English and Brazilian Portuguese catalogs live in `src/i18n/locales/`. After editing translations, run `yarn locales:format` and `yarn locales:check`.

## License

The original algorithm (Rosa Retícula) and original project code are licensed under [GPL-3.0](LICENSE.txt). Third-party dependencies remain under their respective licenses.

## Credits

Created by [rosa-gus](https://rosa-gus.github.io/portfolio). The blur implementation follows [Pillow's extended-box approach](https://github.com/python-pillow/Pillow/blob/12.3.0/src/libImaging/BoxBlur.c). Font licenses are included in [public/licenses/](public/licenses/).

Example photographs are credited in the [manifest](src/assets/examples/manifest.json). The photograph used in `public/og-image.png` is by [Yang Deng](https://unsplash.com/@palon).
