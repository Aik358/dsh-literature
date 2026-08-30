import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm, mkdir } from 'node:fs/promises'

process.env.DSH_HOME = await mkdtempLocal()

async function mkdtempLocal() {
  const dir = join(tmpdir(), `dsh-literature-test-${Date.now()}`)
  await mkdir(dir, { recursive: true })
  return dir
}

const { apply } = await import('../lib/index.js')

const registered = { routes: [], tools: [], events: [] }
const ctx = {
  webServer: {
    register: (route) => {
      registered.routes.push(route)
      return () => {}
    },
  },
  tools: {
    register: (def) => {
      registered.tools.push(def)
      return () => {}
    },
  },
  on: (name, fn) => {
    registered.events.push([name, fn])
    return () => {}
  },
  effect: (fn) => {
    const r = fn()
    if (typeof r === 'function') r()
    return () => {}
  },
}

let failures = 0
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  }
}

function makeReq(method, path, remoteAddress = '127.0.0.1', body = null) {
  const chunks = body ? [Buffer.from(body)] : []
  return {
    method,
    url: path,
    socket: { remoteAddress },
    destroy: () => {},
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c
    },
  }
}

function makeRes() {
  const res = new PassThrough()
  res.writeHead = (status, headers) => {
    res.status = status
    res.headers = headers
    res.writeHeadCalled = true
  }
  return res
}

function collect(res) {
  return new Promise((resolve) => {
    let out = ''
    res.on('data', (c) => (out += c))
    res.on('end', () => resolve(out))
    res.on('close', () => resolve(out))
  })
}

function collectBriefly(res, ms = 800) {
  return new Promise((resolve) => {
    let out = ''
    res.on('data', (c) => (out += c))
    const done = () => resolve(out)
    res.on('end', done)
    res.on('close', done)
    setTimeout(() => {
      try {
        res.destroy()
      } catch {
        /* already gone */
      }
    }, ms)
  })
}

const dispose = apply(ctx)
await new Promise((r) => setTimeout(r, 300))

const prefix = registered.routes.find((r) => r.kind === 'prefix')
check('registered a prefix route', !!prefix)
check('registered agent tools (2)', registered.tools.length === 2, registered.tools.map((t) => t.name))
check('registered session hook event', registered.events.some(([n]) => n === 'session/event'))

const handler = prefix.handler

// 1. loopback guard
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/state', '10.0.0.5')
  const p = collect(res)
  await handler(req, res)
  const body = await p
  check('non-loopback request is 403', res.status === 403, { status: res.status, body: body.slice(0, 60) })
}

// 2. state
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/state')
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('state returns 200', res.status === 200)
  check('state finds dataDir', typeof body.zotero.dataDir === 'string' && body.zotero.dataDir.length > 0, body.zotero.dataDir)
  check('state reports zotero not running', body.zotero.running === false, body.zotero.running)
  check('state has items array', Array.isArray(body.items))
}

// 3. scan
{
  const res = makeRes()
  const req = makeReq('POST', '/api/dsh-literature/scan', '127.0.0.1', Buffer.from(JSON.stringify({ text: '参考 DOI: 10.1038/s41586-021-03819-2 与 arXiv:1706.03762。' })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('scan created entries', Array.isArray(body.created) && body.created.length === 2, body.created?.map((c) => c.key))
}

// 4. duplicate scan does not re-add
{
  const res = makeRes()
  const req = makeReq('POST', '/api/dsh-literature/scan', '127.0.0.1', Buffer.from(JSON.stringify({ text: '10.1038/s41586-021-03819-2' })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('re-scan dedupes (0 created)', body.created.length === 0, body.created?.length)
}

// 5. resolve (network; may fail in sandbox but must not crash)
{
  const res = makeRes()
  const stateRes = makeRes()
  const sreq = makeReq('GET', '/api/dsh-literature/state')
  const sp = collect(stateRes)
  await handler(sreq, stateRes)
  const { items } = JSON.parse(await sp)
  const key = items[0]?.key
  const rreq = makeReq('POST', '/api/dsh-literature/resolve', '127.0.0.1', Buffer.from(JSON.stringify({ key })))
  const rp = collect(res)
  await handler(rreq, res)
  const body = JSON.parse(await rp)
  const okShape = !!(body.item && typeof body.item.state === 'string')
  check('resolve completes to a state (resolved or failed)', okShape, body.item?.state)
}

// 6. import: local PDF upload for paywalled papers
{
  // Grab an existing item key from the store.
  const stateRes = makeRes()
  const sreq = makeReq('GET', '/api/dsh-literature/state')
  const sp = collect(stateRes)
  await handler(sreq, stateRes)
  const { items } = JSON.parse(await sp)
  const key = items[0]?.key

  const res = makeRes()
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 65)])
  const req = makeReq('POST', `/api/dsh-literature/import?key=${key}&filename=local.pdf`, '127.0.0.1', pdf)
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('import stores the uploaded PDF', body.item?.pdf?.source === 'local-import', body.item?.pdf)
  check('import falls through to save (zotero down -> save_failed)', ['saved', 'save_failed'].includes(body.item?.state), body.item?.state)

  // Non-PDF payload is rejected.
  const res2 = makeRes()
  const req2 = makeReq('POST', `/api/dsh-literature/import?key=${key}&filename=bad.pdf`, '127.0.0.1', Buffer.from('<!doctype html><title>Sign in</title>'))
  const p2 = collect(res2)
  await handler(req2, res2)
  const body2 = JSON.parse(await p2)
  check('non-PDF upload is rejected', res2.status === 500 && /PDF/.test(body2.error ?? ''), { status: res2.status, error: body2.error })
}

// 6b. drop: drag-and-drop PDF import (DOI filename -> saved builtin)
{
  const res = makeRes()
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 70)])
  const req = makeReq('POST', '/api/dsh-literature/drop?filename=10.1234_test.pdf', '127.0.0.1', pdf)
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('drop imports into the built-in library', body.item?.state === 'saved' && body.item?.saveMode === 'builtin', body.item?.state)

  const resBad = makeRes()
  const reqBad = makeReq('POST', '/api/dsh-literature/drop?filename=bad.txt', '127.0.0.1', Buffer.from('not a pdf'))
  const pBad = collect(resBad)
  await handler(reqBad, resBad)
  const bodyBad = JSON.parse(await pBad)
  check('drop rejects non-PDF payloads', resBad.status === 500 && /PDF/.test(bodyBad.error ?? ''), bodyBad.error)
}

// 6c. search + add-candidate routes
{
  const res = makeRes()
  const req = makeReq('POST', '/api/dsh-literature/search', '127.0.0.1', Buffer.from(JSON.stringify({ q: 'attention is all you need', rows: 3 })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('search returns candidates', Array.isArray(body.candidates) && body.candidates.length > 0, body.candidates?.length)

  const res2 = makeRes()
  const req2 = makeReq('POST', '/api/dsh-literature/add-candidate', '127.0.0.1', Buffer.from(JSON.stringify({ candidate: body.candidates[0] })))
  const p2 = collect(res2)
  await handler(req2, res2)
  const body2 = JSON.parse(await p2)
  check('add-candidate creates a resolved item', body2.item?.state === 'resolved' && !!body2.item?.record, body2.item?.state)
}

// 7. pdf route without a downloaded file → 404
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/pdf/nonexistent')
  const p = collect(res)
  await handler(req, res)
  check('missing pdf is 404', res.status === 404, res.status)
}

// 8. unknown route
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/nope')
  const p = collect(res)
  await handler(req, res)
  check('unknown route is 404', res.status === 404, res.status)
}

// 9. SSE
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/events')
  const p = collectBriefly(res)
  await handler(req, res)
  const body = await p
  check('sse returns event-stream', /text\/event-stream/.test(res.headers?.['content-type'] ?? ''), res.headers)
  check('sse emits hello frame', body.includes('event: hello'), body.slice(0, 120))
}

dispose()
await rm(process.env.DSH_HOME, { recursive: true, force: true })

console.log(failures === 0 ? '\nHOST TESTS ALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
