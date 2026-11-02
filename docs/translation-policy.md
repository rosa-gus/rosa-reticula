# Translation policy

<!-- translation-coverage:start -->

| Locale | UI coverage |
| --- | ---: |
| pt-BR | 100% (162/162) |
| en-US | 100% (162/162) |

<!-- translation-coverage:end -->

This app follows the UI localization strategy used by `timbre-palette`.

Declare canonical locales, autonyms, language mappings, and fallback in
`shared/i18n/locales.json`. Resolve language from supported `?lang=`, the app's
saved preference (`rosa-reticula:locale:v1`), browser preferences, then `en-US`.
Map English and Portuguese language tags to `en-US` and `pt-BR`.

English defines the complete startup catalog, message keys, and named parameters.
Portuguese loads on demand. Missing or runtime-blank translations fall back per
message to English without changing the selected locale or number formatting.
Omit untranslated keys; committed blanks are invalid.

Use nested JSON with one owner file per top-level namespace and semantic keys.
Keep full sentences together. Cardinal ICU plurals require `other`; pass finite
numbers, and format `#` with the selected UI locale. Plural categories follow the
message's language, including fallback. The shared parser and catalog validator
come from `timbre-palette`. Markup stays in components; this app uses plain text
messages and HTML-escapes strings inserted into its initial template.

Language changes update text, accessibility labels, document language, metadata,
and display formatting in place. They must preserve the bitmap, processed raster,
parameters, selected profile, custom names, filenames, view, zoom, and split position.
Recipe values, IDs, JSON schemas, Worker errors, and processing caches remain
language-independent. Translate known error codes in the UI and use a generic
message for unknown failures. Custom profile names and attribution are authored
content and are not translated. Decimal lists in recipes and advanced inputs keep
their canonical dot notation and comma separators; localized slider outputs are
presentation only.

After catalog changes run `yarn locales:format`, `yarn locales:generate`, and
`yarn locales:check`. Commit generated loaders and parameter types. Validation
rejects duplicate and unknown keys, blank messages, malformed plurals, incompatible
parameters, and stale artifacts. The coverage above counts a locale's own messages;
fallback never contributes. Automated checks validate structure, not wording.
