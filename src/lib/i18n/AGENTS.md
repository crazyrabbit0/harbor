# src/lib/i18n

Notes for agents working in this folder.

## How strings resolve

- `t(key, vars?)`: the key IS the English text (e.g. `t("Start reading")`), with `{name}` placeholders. `{{...}}` is forbidden.
- Lookup order: the plural variant `key#one|few|many` (only for languages in `PLURAL_RULES`, count taken from a numeric var), then the active catalog, then `en`, then the raw key. A missing key never errors; it silently shows English.
- English is compiled in. Other locales are lazy `import()`s in `load-locale.ts`; adding a language needs a loader there (a `satisfies` check makes a missing loader a type error) plus `languages.ts` / the `UiLanguage` union.

## Adding or changing strings

- Write keys as string literals in `t("...")`. `tests/i18n-coverage.test.ts` only scans literal first arguments, and dynamic keys are invisible to it.
- English goes in `locales/en/<feature>.ts`, and that file must be imported AND spread into `locales/en.ts`. A feature file that isn't spread is silently dead.
- Each translated locale (`locales/<lang>/<feature>.ts`, spread into `<lang>.ts`) must contain every literal key; `i18n-coverage` enforces this for all 15 non-English locales. `locales/ui-fallback.ts` holds English placeholder values that satisfy the test without translating. Every `<lang>.ts` spreads it FIRST in its catalog object, so any real translation spread or listed after it wins; a key added there never hides one.
- Barrels are `Record<string, string>` object spreads: later spreads win, and tsc catches neither typos nor duplicate keys.

## Checks

- `node scripts/check-i18n.mjs` reports parity, unspread files, placeholder mismatches and shadowed duplicates. It exits 0 unless `--strict` is passed.
- `i18n-coverage` passes: keys no locale translates yet sit in `ui-fallback.ts`. `check-i18n` still reports locale feature files that are never spread (`<lang>/music-*.ts`); none of them holds a key the fallback fills.
- Crowdin: the TS files are the source. `node scripts/i18n-crowdin.mjs export` writes `i18n/*.json`, and `import` writes `locales/<lang>/crowdin.ts`. Never hand-edit `i18n/*.json`.
