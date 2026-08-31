/**
 * Regression test for React error #310 in SettingsPage.
 *
 * The bug: four `useState` calls lived AFTER an early `return`, so the first
 * render (form === null) registered 6 hooks and the next render registered 10
 * — "Rendered more hooks than during the previous render" (error #310), which
 * crashed the better-sidebar render chain and left toasts/menus blank.
 *
 * This renders the real component with React 18 + jsdom and drives the exact
 * transition (config arrives → form initialises) that used to blow up.
 */
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.getComputedStyle = dom.window.getComputedStyle

const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = require('react-dom/test-utils')

const store = require('../src/client/store.cjs')
const { SettingsPage } = require('../src/client/settings.cjs')

let failures = 0
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  }
}

const container = document.createElement('div')
document.body.appendChild(container)
const root = createRoot(container)

// Prime the store as the host would: config starts null (before /state loads).
store.set({ config: null, loaded: true, items: [], tasks: {} })

let renderError = ''
const origError = console.error
console.error = (...args) => {
  const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')
  if (/Rendered more hooks|#310|Minified React error/.test(msg)) renderError += msg
  origError(...args)
}

// First render: config still null -> the component takes its early-return path.
act(() => {
  root.render(React.createElement(SettingsPage, { close: null }))
})
check('first render (form null) does not crash', !renderError, renderError)

// Now the /state payload arrives: re-render must NOT flip the hook count.
act(() => {
  store.set({ config: { saveMode: 'builtin', version: 1 } })
})
check('config arrival renders full settings without hook-count flip', !renderError, renderError)

const html = container.innerHTML
check('full settings page rendered', html.includes('文献侧窗设置') || html.includes('saveMode'), html.slice(0, 120))

// Interaction smoke: switching a select must not crash either.
act(() => {
  const sel = container.querySelector('select')
  if (sel) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set
    setter.call(sel, 'dir')
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  }
})
check('interaction (change event) does not crash', !renderError, renderError)

root.unmount()
console.error = origError

console.log(failures === 0 ? '\nSETTINGS RENDER TEST ALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
