import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const nodeRequire = createRequire(import.meta.url)
const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let entry = null
const context = vm.createContext({
  console,
  require: nodeRequire,
  window: { __ModuleLoader__: { load: (e) => (entry = e) } },
  URL,
  Blob,
  Worker: class Worker {},
  EventSource: class EventSource {
    addEventListener() {}
    removeEventListener() {}
    close() {}
  },
  document: {
    createElement: () => ({ dataset: {}, setAttribute() {}, appendChild() {}, remove() {} }),
    getElementById: () => null,
    head: { appendChild() {} },
  },
  localStorage: { getItem: () => null, setItem() {} },
  fetch: () => Promise.resolve({ ok: true, json: () => ({}), text: () => '' }),
  AbortController,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  __PDFJS_WORKER_SRC__: '',
  __PLUGIN_ID__: '@a9i5k4/dsh-literature',
})
vm.runInContext(code, context, { filename: 'lib/client.js' })

const disposers = []
const slots = {
  inject: (key, cb) => {
    const d = cb()
    return typeof d === 'function' ? d : () => {}
  },
  register: () => () => {},
}
const ctx = {
  effect: (fn) => {
    const r = fn()
    disposers.push(r)
    return r
  },
  on: () => () => {},
  dispose: () => {},
  locale: {
    register: () => {},
    snapshot: () => ({ locale: 'zh' }),
  },
  slots,
}

const module = { exports: {} }
const mod = entry.factory((id) => nodeRequire(id))

console.log('apply:', typeof mod.apply, '| inject:', JSON.stringify(mod.inject))

try {
  mod.apply(ctx)
  console.log('APPLY OK')
} catch (e) {
  console.error('APPLY FAILED:', e?.message)
  console.error(e?.stack)
  process.exit(1)
}
