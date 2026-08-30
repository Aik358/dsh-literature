import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'

/**
 * Executes the built client and runs `apply(ctx)` against host mocks, covering
 * every entry-placement branch:
 *   1. no better-sidebar            → footer entry mounts
 *   2. better-sidebar present       → tab mounts, no footer entry
 *   3. better-sidebar appears late  → poll migrates footer → tab
 */

const nodeRequire = createRequire(import.meta.url)
const code = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let failures = 0
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  }
}

function makeHost({ withBsb = false, bsbLate = false, gated = false } = {}) {
  const registered = { tabs: [], footerEntries: 0, overlay: 0 }
  const disposers = []

  const slots = {
    inject: (key, cb) => {
      const d = cb()
      if (key === 'sidebar.footer.action') registered.footerEntries += 1
      if (key === 'shell.overlay') registered.overlay += 1
      return typeof d === 'function' ? d : () => {}
    },
    register: () => () => {},
  }

  const bsbService = () => ({ registerTab: (d) => (registered.tabs.push(d), () => {}) })
  let bsb = withBsb ? bsbService() : undefined

  const ctx = {
    effect: (fn) => {
      const r = fn()
      disposers.push(r)
      return r
    },
    on: () => () => {},
    dispose: () => {},
    locale: { register: () => {}, snapshot: () => ({ locale: 'zh' }) },
    slots,
    // `ctx.get` is the ungated optional lookup the client runner exposes.
    get: (name) => (name === 'betterSidebar' ? bsb : undefined),
    // Direct property reads are gated by the inject declaration on the real
    // runtime: they THROW unless declared. `gated` emulates that.
    get betterSidebar() {
      if (gated) throw new Error('service "betterSidebar" is not declared by your plugin')
      return bsb
    },
    __lateBsb: () => {
      bsb = bsbService()
    },
  }

  if (bsbLate) {
    setTimeout(() => ctx.__lateBsb(), 500)
  }

  return { ctx, registered }
}

function loadBundle() {
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
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    __PDFJS_WORKER_SRC__: '',
    __PLUGIN_ID__: '@a9i5k4/dsh-literature',
  })
  vm.runInContext(code, context, { filename: 'lib/client.js' })
  const module = { exports: {} }
  return entry.factory((id) => nodeRequire(id))
}

const mod = loadBundle()
console.log('apply:', typeof mod.apply, '| inject:', JSON.stringify(mod.inject))

// ---- scenario 1: no better-sidebar --------------------------------------
{
  const { ctx, registered } = makeHost({})
  try {
    mod.apply(ctx)
  } catch (e) {
    console.error(e?.stack)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 50))
  check('S1 no-bsb: footer entry mounts', registered.footerEntries === 1, registered)
  check('S1 no-bsb: overlay panel mounts', registered.overlay >= 1, registered.overlay)
  check('S1 no-bsb: no tab', registered.tabs.length === 0, registered.tabs)
}

// ---- scenario 2: better-sidebar present ----------------------------------
{
  const { ctx, registered } = makeHost({ withBsb: true })
  try {
    mod.apply(ctx)
  } catch (e) {
    console.error(e?.stack)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 50))
  check('S2 bsb: tab mounts', registered.tabs.length === 1, registered.tabs.map((t) => t.id))
  check('S2 bsb: tab id is dsh-literature:library', registered.tabs[0]?.id === 'dsh-literature:library')
  check('S2 bsb: no footer entry', registered.footerEntries === 0, registered.footerEntries)
}

// ---- scenario 3: better-sidebar appears late ------------------------------
{
  const { ctx, registered } = makeHost({ bsbLate: true })
  try {
    mod.apply(ctx)
  } catch (e) {
    console.error(e?.stack)
    process.exit(1)
  }
  // poll interval is 200ms; the service arrives at ~500ms → migrate by ~700ms
  await new Promise((r) => setTimeout(r, 1500))
  check('S3 late-bsb: footer mounted first', registered.footerEntries === 1, registered)
  check('S3 late-bsb: migrated to tab', registered.tabs.length === 1, registered.tabs.map((t) => t.id))
}

// ---- scenario 4: client runner gates property reads (the real runtime) ----
{
  // The dynamic ctx throws on undeclared property reads but ctx.get() still
  // resolves the service — exactly how dsh-cordis-client-runner behaves.
  const { ctx, registered } = makeHost({ withBsb: true, gated: true })
  try {
    mod.apply(ctx)
  } catch (e) {
    console.error(e?.stack)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 50))
  check('S4 gated-bsb: tab mounts via ctx.get', registered.tabs.length === 1, registered.tabs.map((t) => t.id))
  check('S4 gated-bsb: no footer entry', registered.footerEntries === 0, registered.footerEntries)
}

console.log(failures === 0 ? '\nAPPLY MATRIX ALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
