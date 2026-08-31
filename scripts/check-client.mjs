import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

/**
 * Simulates the DSH shell's lazy-CJS loader to prove the built client is a
 * well-formed `window.__ModuleLoader__.load({ id, factory })` module and that
 * its `apply`/`inject` exports come out the other end. React is stubbed — the
 * test never renders anything.
 */

const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let entry = null
const reactStub = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop === 'createElement') return () => null
      return () => () => null
    },
    has() {
      return true
    },
  },
)
// react-dom is host-provided; the bundle only calls createPortal / createRoot.
const reactDomStub = {
  createPortal: (node) => node,
  createRoot: () => ({ render() {}, unmount() {} }),
}

const context = vm.createContext({
  console,
  window: {
    __ModuleLoader__: {
      load: (e) => {
        entry = e
      },
    },
  },
  URL: class URL {},
  Blob: class Blob {},
  Worker: class Worker {},
  EventSource: class EventSource {},
  document: {
    createElement: () => ({ setAttribute() {}, appendChild() {}, remove() {} }),
    getElementById: () => null,
    head: { appendChild() {} },
  },
  localStorage: { getItem: () => null, setItem() {} },
  fetch: () => Promise.resolve({ ok: true, json: () => ({}), text: () => '' }),
  AbortController: class AbortController {},
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  crypto: {},
  __PDFJS_WORKER_SRC__: '',
  __PLUGIN_ID__: '@a9i5k4/dsh-literature',
})

vm.runInContext(code, context, { filename: 'lib/client.js' })

if (!entry) throw new Error('__ModuleLoader__.load was never called')
if (entry.id !== '@a9i5k4/dsh-literature') throw new Error(`unexpected id: ${entry.id}`)
if (typeof entry.factory !== 'function') throw new Error('factory is not a function')

const module = { exports: {} }
const ret = entry.factory((id) => {
  if (id === 'react') return reactStub
  if (id === 'react-dom') return reactDomStub
  throw new Error(`unexpected runtime require: ${id}`)
})

const mod = ret ?? module.exports
if (typeof mod.apply !== 'function') throw new Error('apply export missing')
const inject = mod.inject
if (!Array.isArray(inject)) throw new Error('inject export missing')
console.log(`entry.id          = ${entry.id}`)
console.log(`apply             = ${typeof mod.apply}`)
console.log(`inject            = ${JSON.stringify(inject)}`)
console.log('CLIENT BUNDLE OK')
