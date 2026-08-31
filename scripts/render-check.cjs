/**
 * DOM-level smoke test for the client bundle: renders the real Panel /
 * SettingsPage / ItemCard components in jsdom and drives the citation
 * dropdown end-to-end, so regressions like "no hooks after early return"
 * (React #310) or "clicking cite does nothing" are caught.
 *
 * Run: node scripts/render-check.cjs   (needs devDependency jsdom)
 */
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = require('react-dom/test-utils')

;(async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  global.window = dom.window
  global.document = dom.window.document
  global.localStorage = dom.window.localStorage
  global.URL = dom.window.URL
  global.HTMLElement = dom.window.HTMLElement
  global.Event = dom.window.Event
  global.MouseEvent = dom.window.MouseEvent
  global.IS_REACT_ACT_ENVIRONMENT = true

  // Clipboard / prompt stubs — the cite flow relies on them.
  Object.defineProperty(global.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  })
  dom.window.prompt = () => '12-15'
  global.prompt = () => '12-15'

  let failures = 0
  const check = (label, cond, detail) => {
    if (cond) console.log(`  ok   ${label}`)
    else {
      failures += 1
      console.log(`  FAIL ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
    }
  }

  // The panel's store/api are plain CJS modules — patch the api object in
  // place so components exercise the real store wiring with a fake host.
  // NB: the module exports `{ api, subscribe, BASE }`; the store destructures
  // the INNER `api` object, so that is what must be patched.
  const apiModule = require('../src/client/api.cjs')
  const api = apiModule.api
  const store = require('../src/client/store.cjs')

  const cited = []
  api.cite = async (key, opts) => {
    cited.push({ key, opts })
    return { text: `citation for ${key} [${opts.style}/${opts.mode}]` }
  }
  api.state = async () => ({
    config: { saveMode: 'builtin', autoResolve: true },
    zotero: { running: false },
    items: [
      {
        key: 'doi:10.1000/test',
        title: 'Test Paper Title',
        state: 'saved',
        saveMode: 'builtin',
        record: { title: 'Test Paper Title', authors: [{ lastName: 'Doe', firstName: 'Jane' }], year: 2024 },
      },
    ],
    tasks: [],
    selectedCollection: null,
  })
  api.saveConfig = async (patch) => ({ config: { saveMode: 'builtin', ...patch } })
  api.annotations = async () => ({ annotations: [] })
  api.resolve = async () => ({})
  api.fetch = async () => ({})
  api.save = async () => ({})
  api.retry = async () => ({})
  api.discard = async () => ({ ok: true })
  api.diff = async () => ({ conflict: null })
  api.scanDir = async () => ({ imported: 0, skipped: [] })
  api.importZotero = async () => ({ count: 0 })

  const h = React.createElement
  const { Panel } = require('../src/client/panel.cjs')
  const { SettingsPage } = require('../src/client/settings.cjs')

  const rootEl = document.getElementById('root')
  const root = createRoot(rootEl)

  function click(el) {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
  }

  // --- 1. SettingsPage renders without React #310 (hooks before early return) ---
  {
    store.set({ config: null })
    await act(async () => {
      root.render(h(SettingsPage, { key: 'settings' }))
    })
    await act(async () => {
      store.set({
        config: {
          saveMode: 'builtin', panelWidth: 380, naming: '{author}_{year}_{title}',
          exportFormats: ['ris'], preferredTags: [], customSources: [],
          retry: { maxAttempts: 3 }, fetchTimeoutMs: 30000, conflictStrategy: 'ask',
          readerFit: 'fit-width', entryMode: 'auto', importDir: '', watchImport: false,
        },
      })
    })
    // After config arrives the full form renders; a #310 crash would have thrown.
    const settingsEl = rootEl.querySelector('.zt-settings')
    check('SettingsPage renders after config arrives (no #310)', !!settingsEl && settingsEl.querySelector('select') !== null)
    await act(async () => {
      root.render(null)
    })
  }

  // --- 2. ItemCard + citation dropdown end-to-end ---
  {
    const stateData = await api.state()
    const before = cited.length
    store.set({
      items: stateData.items,
      config: { saveMode: 'builtin', autoResolve: true },
      loaded: true, zotero: { running: false }, tasks: {}, busy: {}, open: true,
    })
    await act(async () => {
      root.render(h(Panel, { onClose: () => {} }))
    })

    const citeButtons = [...rootEl.querySelectorAll('.zt-iconbtn')].filter((b) =>
      /引用|Cite/i.test(b.getAttribute('title') || ''))
    check('citation trigger button exists', citeButtons.length >= 1, citeButtons.length)
    if (citeButtons.length) {
      await act(async () => {
        click(citeButtons[0])
      })
      const menu = rootEl.querySelector('.zt-menu')
      check('citation menu opens on trigger click', !!menu)
      if (menu) {
        const items = [...menu.querySelectorAll('.zt-menu-item')]
        check('citation menu has items', items.length >= 4, items.length)
      const apaItem = items[0]
      let nativeClicks = 0
      apaItem.addEventListener('click', () => { nativeClicks += 1 })
      await act(async () => {
        click(apaItem)
      })
      const menuAfter = rootEl.querySelector('.zt-menu')
      check('citation menu closes after item click', !menuAfter, !!menuAfter)
      check('native click listener fires', nativeClicks === 1, nativeClicks)
      check('citing an item reaches the host', cited.length === before + 1 && cited[cited.length - 1].opts.style === 'apa', cited.slice(before))
        check('toast confirms the copy', /已复制|Copied/.test(rootEl.textContent || ''), (rootEl.textContent || '').slice(-60))
      }
    }
  }

  // --- 3. Reading view boots into the reader shell without crashing ---
  {
    const item = { ...(await api.state()).items[0], pdf: { path: '/tmp/x.pdf' } }
    store.set({ items: [item], selectedKey: item.key, view: 'reader', open: true })
    await act(async () => {
      root.render(h(Panel, { onClose: () => {} }))
    })
    const readerEl = rootEl.querySelector('.zt-reader')
    check('reader view renders (shell present)', !!readerEl)
    if (readerEl) {
      const backBtn = [...readerEl.querySelectorAll('.zt-iconbtn')].find((b) =>
        /返回|Back/i.test(b.getAttribute('title') || ''))
      check('reader toolbar renders', !!backBtn)
    }
    await act(async () => {
      root.render(null)
    })
  }

  console.log(failures === 0 ? '\nRENDER CHECK ALL PASS' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => {
  console.error('RENDER CHECK CRASHED:', e?.stack ?? e)
  process.exit(1)
})
