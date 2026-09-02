/**
 * Regression test for the UI language switch.
 *
 * Two things can silently break here, and neither shows up as a crash:
 *
 * 1. Preference resolution. The host language is only an *input*; a pinned
 *    preference must win. If that ordering regresses, an English DeepSeek
 *    client would override a user who explicitly chose Chinese.
 *
 * 2. Repaint on switch. t() is read synchronously and translated strings are
 *    not part of the store's state, so `emit()` alone leaves React's snapshot
 *    referentially identical and useSyncExternalStore skips the re-render —
 *    the UI keeps the old language until the next unrelated state change.
 *    store.cjs bumps `localeVersion` to get a fresh object identity; this test
 *    asserts that the listeners actually fire with a new snapshot.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const i18n = require('../src/client/i18n.cjs')

let failures = 0
function check(name, actual, expected) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`)
}

/* ---------------------------------------------------------------- coverage */
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, p ? `${p}.${k}` : k) : [p ? `${p}.${k}` : k],
  )

const zhKeys = new Set(flat(i18n.zh))
const enKeys = new Set(flat(i18n.en))
const missing = [...zhKeys].filter((k) => !enKeys.has(k))
const extra = [...enKeys].filter((k) => !zhKeys.has(k))

check('zh/en key count matches', zhKeys.size, enKeys.size)
check('no key missing from en (would fall back to zh)', missing.length, 0)
check('no orphan key in en', extra.length, 0)
if (missing.length) console.log('  missing:', missing.join(', '))
if (extra.length) console.log('  extra:', extra.join(', '))

/* ------------------------------------------------------------- resolution */
// 'auto' follows the host in both directions.
i18n.setPreference('auto')
i18n.setHostLocale('en')
check('auto + host en -> en', i18n.currentLocale(), 'en')
check('auto + host en translates to en', i18n.t('close'), 'Close')

i18n.setHostLocale('zh')
check('auto + host zh -> zh', i18n.currentLocale(), 'zh')
check('auto + host zh translates to zh', i18n.t('close'), '关闭')

// A pinned preference beats whatever the host later reports.
i18n.setPreference('zh')
i18n.setHostLocale('en')
check('pinned zh survives a host switch to en', i18n.currentLocale(), 'zh')
check('pinned zh keeps zh strings', i18n.t('close'), '关闭')

i18n.setPreference('en')
check('pinned en overrides a zh host', i18n.currentLocale(), 'en')
check('pinned en yields en strings', i18n.t('close'), 'Close')

// Unknown / absent input must not wedge the locale.
i18n.setPreference('klingon')
check('unknown preference falls back to auto', i18n.getPreference(), 'auto')
i18n.setHostLocale(null)
check('no host + auto -> zh default', i18n.currentLocale(), 'zh')

// The new language settings strings must exist in both tables.
i18n.setPreference('zh')
check('zh has settings.uiLanguage', i18n.t('settings.uiLanguage'), '界面语言')
i18n.setPreference('en')
check('en has settings.uiLanguage', i18n.t('settings.uiLanguage'), 'Interface language')

/* ------------------------------------------------- no hardcoded strings */
// Any CJK literal left in the browser half is a string that will not follow a
// language switch. This is what caught the diff table headers, the author
// "et al." suffix, the page-prompt and the PDF error messages.
const fs = require('node:fs')
const path = require('node:path')
const clientFiles = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (p.endsWith('.cjs') && !p.endsWith('i18n.cjs')) clientFiles.push(p)
  }
})('src/client')

const hardcoded = []
for (const file of clientFiles) {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, idx) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
      if (/['"`][^'"`]*[一-龥][^'"`]*['"`]/.test(code)) hardcoded.push(`${file}:${idx + 1}`)
    })
}
check('no CJK literals outside i18n.cjs', hardcoded.length, 0)
if (hardcoded.length) console.log('  hardcoded:', hardcoded.join(', '))

/* ------------------------------------------------- error localisation */
i18n.setPreference('zh')
check('coded error translates to zh', i18n.localizeError({ code: 'noSelection', message: 'nope' }), '没有选择要导出的条目')
check('unknown code falls back to message', i18n.localizeError({ code: 'ZZZ', message: 'raw text' }), 'raw text')
check('codeless error passes through', i18n.localizeError({ message: 'plain' }), 'plain')
check('null error is empty', i18n.localizeError(null), '')

i18n.setPreference('en')
check('coded error translates to en', i18n.localizeError({ code: 'noSelection', message: 'nope' }), 'Select at least one item to export')
check('pdf timeout is translated', i18n.localizeError({ code: 'timeout' }), 'Request timed out — please retry')

/* ------------------------------------------------------- interpolation */
check('interpolates a single param', i18n.t('action.copied', { label: 'DOI' }), 'Copied DOI')
check('interpolates several params', i18n.t('error.pdfRenderFailed', { page: 7, message: 'boom' }), 'Failed to render page 7: boom')
i18n.setPreference('zh')
check('zh uses the ideographic separator', i18n.t('authors.etAl', { names: `A${i18n.t('authors.join')}B` }), 'A、B 等')

/* ------------------------------------------------------------ repaint path */
i18n.setPreference('auto')
i18n.setHostLocale('zh')

let notifications = 0
const unsubscribe = i18n.subscribe(() => {
  notifications++
})

i18n.setPreference('en')
check('switching notifies locale subscribers', notifications, 1)

// A no-op switch must not repaint — otherwise every SSE tick would churn.
i18n.setPreference('en')
check('redundant switch does not notify', notifications, 1)

unsubscribe()

/* ----------------------------------------------------------------- verdict */
if (failures) {
  console.error(`\n${failures} CHECK(S) FAILED`)
  process.exit(1)
}
console.log('\nI18N OK')
