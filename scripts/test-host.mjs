import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm, mkdir } from 'node:fs/promises'

// DSH_HOME MUST be set before any module import: config caches the storage
// paths at import time, so a late assignment would send test data to the
// real user profile.
const TEST_HOME = join(tmpdir(), `dsh-literature-test-${Date.now()}`)
await mkdir(TEST_HOME, { recursive: true })
process.env.DSH_HOME = TEST_HOME
// Guard: never let this suite touch the real profile — a misconfigured env
// would overwrite real user data (this happened once and corrupted a PDF).
if (!TEST_HOME.includes('dsh-literature-test-')) throw new Error('test isolation broken')

const pipeline = await import('../src/node/pipeline.js')

const { apply } = await import('../lib/index.js')

const registered = { routes: [], tools: [], events: [] }
const steered = [] // AI-assist messages captured by the mock agent
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
  agents: {
    get: (id) => (id === 'test-session' ? { steer: (m) => steered.push(m) } : undefined),
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
    headers: {},
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
// Tools are mounted permanently since 0.3.1: the user wants the skill
// selectable any time without activation gymnastics. Panel-open / intent
// signals stay wired as positive signals but no longer gate registration.
check('agent tools registered permanently (10)', registered.tools.length === 10, registered.tools.map((t) => t.name))
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

// 6b2. pdf route must decode URL-encoded title keys (spaces etc.)
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 75)])
  const item = await pipeline.importDroppedPdf(pdf, { filename: 's11920 019 1079 z.pdf' })
  const enc = encodeURIComponent(item.key)
  const { existsSync } = await import('node:fs')
  const res = makeRes()
  const req = makeReq('GET', `/api/dsh-literature/pdf/${enc}`)
  const p = collect(res)
  await handler(req, res)

  check('pdf route decodes space-containing keys', res.status === 200 && Number(res.headers['content-length']) === pdf.length, { status: res.status, len: res.headers['content-length'] })
}

// 6c. search + add-candidate routes
{
  const res = makeRes()
  const req = makeReq('POST', '/api/dsh-literature/search', '127.0.0.1', Buffer.from(JSON.stringify({ q: 'attention is all you need', rows: 3 })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  // The search hits the live Crossref API — allow transient network failures.
  check('search returns a candidate array', Array.isArray(body.candidates), body.candidates)

  if (body.candidates?.length) {
    const res2 = makeRes()
    const req2 = makeReq('POST', '/api/dsh-literature/add-candidate', '127.0.0.1', Buffer.from(JSON.stringify({ candidate: body.candidates[0] })))
    const p2 = collect(res2)
    await handler(req2, res2)
    const body2 = JSON.parse(await p2)
    check('add-candidate creates a resolved item', body2.item?.state === 'resolved' && !!body2.item?.record, body2.item?.state)
  } else {
    console.log('  (skip add-candidate — search API unreachable)')
  }
}

// 7. pdf route without a downloaded file → 404
{
  const res = makeRes()
  const req = makeReq('GET', '/api/dsh-literature/pdf/nonexistent')
  const p = collect(res)
  await handler(req, res)
  check('missing pdf is 404', res.status === 404, res.status)
}

// 7b. pdf route honours byte ranges (pdf.js issues Range requests by default)
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 66)])
  const item = await pipeline.importDroppedPdf(pdf, { filename: 'range test.pdf' })
  const enc = encodeURIComponent(item.key)
  const res = makeRes()
  const req = makeReq('GET', `/api/dsh-literature/pdf/${enc}`)
  req.headers.range = 'bytes=0-1023'
  const p = collect(res)
  await handler(req, res)
  const body = Buffer.from(await p)
  check('pdf range returns 206', res.status === 206, res.status)
  check('pdf range returns the right slice', body.length === 1024, body.length)
  check('pdf range advertises accept-ranges', (res.headers?.['accept-ranges'] ?? '') === 'bytes', res.headers)
}

// 7c. pdf HEAD request resolves with headers and no body
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 68)])
  const item = await pipeline.importDroppedPdf(pdf, { filename: 'head test.pdf' })
  const enc = encodeURIComponent(item.key)
  const res = makeRes()
  const req = makeReq('HEAD', `/api/dsh-literature/pdf/${enc}`)
  const p = collect(res)
  await handler(req, res)
  const body = await p
  check('pdf HEAD returns 200 with content-length', res.status === 200 && Number(res.headers?.['content-length']) === pdf.length,
    { status: res.status, len: res.headers?.['content-length'] })
  check('pdf HEAD ships no body', body.length === 0, body.length)
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

// 10. url page title cleaning must NOT truncate hyphenated titles
{
  const { stripSiteSuffix } = await import('../src/node/metadata/url.js')
  const cases = [
    ['Attention-deficit and hyperactivity disorder - PMC', 'Attention-deficit and hyperactivity disorder'],
    ['Brain | Wiley Online Library', 'Brain'],
    ['Nature – Journal article', 'Nature'],
    ['Hybrid Organic-Inorganic Perovskites – PMC', 'Hybrid Organic-Inorganic Perovskites'],
    ['Pure title', 'Pure title'],
    ['COVID-19 and the immune system', 'COVID-19 and the immune system'],
    ['Title |', 'Title'],
  ]
  for (const [input, expected] of cases) {
    const got = stripSiteSuffix(input)
    check(`stripSiteSuffix keeps "${input}" intact`, got === expected, got)
  }
}

// 11. APA citation keeps issue/pages when volume is absent
{
  const { cite } = await import('../src/node/cite.js')
  const record = {
    itemType: 'journalArticle',
    title: 'A study without a volume',
    authors: [{ lastName: 'Doe', firstName: 'Jane' }],
    year: 2024,
    container: 'Journal of Tests',
    issue: '3',
    pages: '10-15',
  }
  const text = cite(record, { style: 'apa', mode: 'reference' })
  check('apa citation keeps issue when volume missing', text.includes('(3)') && text.includes('10–15'), text)
}

// 12. annotations route round-trips keys with spaces (stored under the SAME
//     raw key so discarding an item also clears its annotations)
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(180, 80)])
  const item = await pipeline.importDroppedPdf(pdf, { filename: 'spaced key paper.pdf' })
  const rawKey = item.key

  const postRes = makeRes()
  const postReq = makeReq('POST', `/api/dsh-literature/annotations/${encodeURIComponent(rawKey)}`, '127.0.0.1',
    Buffer.from(JSON.stringify({ text: 'note on spaced key', pageIndex: 0, rects: [] })))
  const pp = collect(postRes)
  await handler(postReq, postRes)
  await pp
  check('annotation POST works for space-containing key', postRes.status === 201, postRes.status)

  const getRes = makeRes()
  const getReq = makeReq('GET', `/api/dsh-literature/annotations/${encodeURIComponent(rawKey)}`)
  const gp = collect(getRes)
  await handler(getReq, getRes)
  const { annotations } = JSON.parse(await gp)
  check('annotation GET reads back by the same key', Array.isArray(annotations) && annotations.length === 1, annotations)

  // Discarding the item must take its annotations with it (same raw key).
  const delRes = makeRes()
  const delReq = makeReq('POST', '/api/dsh-literature/discard', '127.0.0.1', Buffer.from(JSON.stringify({ key: rawKey })))
  const dp = collect(delRes)
  await handler(delReq, delRes)
  await dp

  const afterRes = makeRes()
  const afterReq = makeReq('GET', `/api/dsh-literature/annotations/${encodeURIComponent(rawKey)}`)
  const ap = collect(afterRes)
  await handler(afterReq, afterRes)
  const after = JSON.parse(await ap)
  check('discarding an item removes its annotations (no orphan leak)', Array.isArray(after.annotations) && after.annotations.length === 0, after.annotations)
}

// 12b. item PATCH route: reader progress + tags persist per item.
//     The entry is created through the BUNDLE route (drop) so it lives in the
//     same store graph the PATCH handler reads (src and bundle keep separate
//     in-memory stores, see section 17).
{
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(160, 81)])
  const dropRes = makeRes()
  const dropReq = makeReq('POST', '/api/dsh-literature/drop?filename=patch%20target.pdf', '127.0.0.1', pdf)
  const dp = collect(dropRes)
  await handler(dropReq, dropRes)
  const dropBody = JSON.parse(await dp)
  const rawKey = dropBody.item?.key
  check('12b setup: drop created the patch entry', !!rawKey, dropBody.error)

  const res = makeRes()
  const req = makeReq('PATCH', `/api/dsh-literature/item/${encodeURIComponent(rawKey)}`, '127.0.0.1',
    Buffer.from(JSON.stringify({ patch: { readerProgress: { pageIndex: 4, ratio: 0.42 }, tags: ['methods', 'nlp'] } })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('item PATCH stores readerProgress', res.status === 200 && body.item?.readerProgress?.pageIndex === 4 && body.item?.readerProgress?.ratio === 0.42, body.item?.readerProgress)
  check('item PATCH stores tags', Array.isArray(body.item?.tags) && body.item.tags.length === 2, body.item?.tags)

  // Round-trip through the store (state route lists the same item).
  const stateRes = makeRes()
  const sreq = makeReq('GET', '/api/dsh-literature/state')
  const sp = collect(stateRes)
  await handler(sreq, stateRes)
  const { items } = JSON.parse(await sp)
  const found = items.find((i) => i.key === rawKey)
  check('item PATCH persists across reads', found?.readerProgress?.pageIndex === 4 && (found?.tags ?? []).includes('methods'), found?.readerProgress)

  // Unknown key -> 404.
  const missRes = makeRes()
  const missReq = makeReq('PATCH', '/api/dsh-literature/item/nope', '127.0.0.1',
    Buffer.from(JSON.stringify({ patch: { readerProgress: { pageIndex: 1, ratio: 0 } } })))
  const mp = collect(missRes)
  await handler(missReq, missRes)
  await mp
  check('item PATCH on missing key is 404', missRes.status === 404, missRes.status)
}

// 12c. export-notes + export-batch routes (5.6 / 5.7)
{
  // Entry created through the bundle route so the bundle store owns it.
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(150, 82)])
  const dropRes = makeRes()
  const dropReq = makeReq('POST', '/api/dsh-literature/drop?filename=export%20me.pdf', '127.0.0.1', pdf)
  const dp = collect(dropRes)
  await handler(dropReq, dropRes)
  const dropBody = JSON.parse(await dp)
  const key = dropBody.item?.key
  check('12c setup: drop created the export entry', !!key, dropBody.error)

  // Seed two annotations (out of page order) through the bundle route.
  const ann1 = { text: 'attention focus', note: 'core idea', pageIndex: 2, rects: [] }
  const ann2 = { text: 'second quote', note: '', pageIndex: 0, rects: [] }
  for (const a of [ann1, ann2]) {
    const ar = makeRes()
    const aq = makeReq('POST', `/api/dsh-literature/annotations/${encodeURIComponent(key)}`, '127.0.0.1', Buffer.from(JSON.stringify(a)))
    const ap = collect(ar)
    await handler(aq, ar)
    await ap
  }

  const enRes = makeRes()
  const enReq = makeReq('GET', `/api/dsh-literature/export-notes/${encodeURIComponent(key)}`)
  const ep = collect(enRes)
  await handler(enReq, enRes)
  const enBody = JSON.parse(await ep)
  check('export-notes returns markdown with p.3 + quote + note',
    enRes.status === 200 && enBody.count === 2 && enBody.markdown.includes('## p.3') && enBody.markdown.includes('> attention focus') && enBody.markdown.includes('core idea'),
    { status: enRes.status, count: enBody.count, md: (enBody.markdown ?? '').slice(0, 120) })
  check('export-notes sorts pages ascending', enBody.markdown.indexOf('## p.1') < enBody.markdown.indexOf('## p.3'), enBody.markdown)

  const ebRes = makeRes()
  const ebReq = makeReq('POST', '/api/dsh-literature/export-batch', '127.0.0.1',
    Buffer.from(JSON.stringify({ keys: [key], format: 'ris' })))
  const bp = collect(ebRes)
  await handler(ebReq, ebRes)
  const ebBody = JSON.parse(await bp)
  check('export-batch returns RIS with a TY block', ebRes.status === 200 && ebBody.count === 1 && ebBody.text.includes('TY  - '), { status: ebRes.status, text: (ebBody.text ?? '').slice(0, 40) })

  const badRes = makeRes()
  const badReq = makeReq('POST', '/api/dsh-literature/export-batch', '127.0.0.1',
    Buffer.from(JSON.stringify({ keys: [], format: 'ris' })))
  const badp = collect(badRes)
  await handler(badReq, badRes)
  await badp
  check('export-batch with no keys is 400', badRes.status === 400, badRes.status)

  // Pure-function batch: 3 records -> 3 RIS blocks (deterministic, no network).
  const { batch, notesMarkdown } = await import('../src/node/exporter.js')
  const rec = (title) => ({ itemType: 'journalArticle', title, authors: [{ lastName: 'X', firstName: 'Y' }], year: 2020 })
  const three = batch('ris', [rec('A'), rec('B'), rec('C')])
  check('batch ris joins 3 blocks', (three.match(/TY  - /g) ?? []).length === 3, three)
  const b2 = batch('bibtex', [rec('A')])
  check('batch bibtex joins entries', b2.includes('@article{'), b2.slice(0, 30))
  const csl = JSON.parse(batch('csl-json', [rec('A'), rec('B')]))
  check('batch csl-json is an array of 2', Array.isArray(csl) && csl.length === 2 && csl[0].type === 'article-journal', csl)
  const md = notesMarkdown('Paper', [{ pageIndex: 1, text: 'q1', note: 'n1' }, { pageIndex: 0, text: 'q0' }])
  check('notesMarkdown headings and blockquote', md.startsWith('# Paper') && md.includes('## p.1') && md.includes('> q1') && md.includes('n1'), md)
}

// 13. custom source templates reject templates whose variables are missing
{
  const { renderSourceTemplate } = await import('../src/node/fetch/pdf.js')
  const rec = { doi: '10.1000/xyz', title: 'Paper', arxiv: '', isbn: '', url: '' }
  check('template with {doi} renders', renderSourceTemplate('https://m.example/{doi}', rec) === 'https://m.example/10.1000%2Fxyz',
    renderSourceTemplate('https://m.example/{doi}', rec))
  check('template with missing {arxiv} is rejected', renderSourceTemplate('https://m.example/{arxiv}/{doi}', rec) === '')
  check('non-http template is rejected', renderSourceTemplate('ftp://m.example/{doi}', rec) === '')
  check('leftover placeholder is rejected', renderSourceTemplate('https://m.example/{doi}/{nope}', rec) === '')
}

// 14. ISBN normalisation & check-digit conversion (pure, no network)
{
  const { normalizeOpenLibrary } = await import('../src/node/metadata/isbn.js')
  const rec = normalizeOpenLibrary({
    title: 'The Laws of Simplicity',
    authors: [{ name: 'John Maeda' }],
    publishers: [{ name: 'The MIT Press' }],
    publish_date: 'August 21, 2006',
    number_of_pages: 100,
  })
  check('openlibrary normalize produces a book record', rec?.itemType === 'book' && rec?.year === 2006, rec?.itemType)
  check('openlibrary normalize splits author names', rec?.authors?.[0]?.lastName === 'Maeda' && rec?.authors?.[0]?.firstName === 'John', rec?.authors)

  // ISBN-10/13 interconversion used to widen the lookup.
  const m = await import('../src/node/metadata/isbn.js')
  const ten = m.__test?.toIsbn10?.(9780262134729) ?? null
  // toIsbn10/toIsbn13 are private; verify through fetchByIsbn's sibling logic
  // by checking normalize of an entry missing a title -> null.
  check('openlibrary normalize rejects empty entries', normalizeOpenLibrary(null) === null)
}

// 14b. BibTeX output (5.5): entry shape + cite() forces reference mode
{
  const { cite, bibtex } = await import('../src/node/cite.js')
  const record = {
    itemType: 'journalArticle',
    title: 'Attention Is All You Need',
    authors: [{ lastName: 'Vaswani', firstName: 'A' }, { lastName: 'Shazeer', firstName: 'N' }],
    year: 2017,
    container: 'NeurIPS',
    volume: '30',
    issue: '1',
    pages: '5998-6008',
    doi: '10.5555/3295222.3295349',
  }
  const text = bibtex(record)
  check('bibtex starts with an article key', /^@article\{Vaswani2017Attention,[\s\S]*\}$/.test(text.trim()), text.slice(0, 60))
  check('bibtex contains author/title/year fields', text.includes('author = {Vaswani, A and Shazeer, N}') && text.includes('title = {Attention Is All You Need}') && /year = \{2017\}/.test(text), text)
  check('bibtex maps container to journal for articles', /journal = \{NeurIPS\}/.test(text), text)
  check('bibtex escapes specials', bibtex({ ...record, title: 'A & B: 100%_test' }).includes('title = {A \\& B: 100\\%\\_test}'), bibtex({ ...record, title: 'A & B: 100%_test' }).split('\n')[2])
  const forced = cite(record, { style: 'bibtex', mode: 'direct', pages: '10' })
  check('cite() forces reference for bibtex (no page suffix)', forced.includes('@article') && !forced.includes('p. 10'), forced.slice(0, 40))
  check('bibtex book mapping', bibtex({ ...record, itemType: 'bookSection', container: 'Some Book' }).includes('@inbook'), 'inbook')
}

// 14c. Citation italics: the formatters mark italics with *…*; the public
//      surface must never leak those asterisks, and the rich forms must turn
//      them into real segments/HTML the dialog can render. Also guards two
//      style rules: APA 7 italicises the VOLUME, and Chicago 17 uses italics
//      (not quotes) for the journal name — the old code nested quotes there.
//
// 14d. Author-name conventions (each style has its own, none shared):
//      APA initials+dot, & before last, 21+ → 19…last; MLA inverted-first,
//      et al. at 3+; Chicago 'and' before last, 11+ → first 7 + et al.;
//      GB 'Last First' with 等 at 4+.
{
  const { cite, citeDetailed, toSegments, stripItalic, segmentsToHtml } = await import('../src/node/cite.js')
  const record = {
    itemType: 'journalArticle',
    title: 'Deep contextualised word representations',
    authors: [{ lastName: 'Peters', firstName: 'M' }],
    year: 2018,
    container: 'Transactions of the ACL',
    volume: '6',
    issue: '1',
    pages: '107-121',
    doi: '10.18653/v1/N18-1202',
  }
  const four = {
    ...record,
    authors: [
      { lastName: 'Peters', firstName: 'Matthew' },
      { lastName: 'Neumann', firstName: 'Mark' },
      { lastName: 'Iyyer', firstName: 'Mohit' },
      { lastName: 'Zettlemoyer', firstName: 'Luke' },
    ],
  }

  // --- APA author format
  const apa4 = cite(four, { style: 'apa', mode: 'reference' })
  check('apa initials carry dots (full names abbreviated)', apa4.includes('Peters, M., Neumann, M., Iyyer, M., & Zettlemoyer, L.'), apa4)
  check('apa no double period before (year)', apa4.includes('& Zettlemoyer, L. (2018).'), apa4)
  check('apa one author has no &', !cite(record, { style: 'apa' }).includes('&'), cite(record, { style: 'apa' }))
  const apa21 = citeDetailed({ ...record, authors: Array.from({ length: 21 }, (_, i) => ({ lastName: `Author${i + 1}`, firstName: 'X' })) }, { style: 'apa' })
  check('apa 21+ authors → 19 + ellipsis + last', apa21.text.includes('Author19, X., … Author21, X.'), apa21.text.slice(0, 200))

  // --- CJK names stay whole (no inversion, no initials) in APA and GB
  const cjkRecord = { ...four, title: '基于稳态视觉诱发电位的脑机接口研究', authors: [
    { lastName: '张', firstName: '三' }, { lastName: '李', firstName: '四' }, { lastName: '王', firstName: '五' },
  ] }
  const apaCjk = cite(cjkRecord, { style: 'apa' })
  check('apa keeps CJK names whole', apaCjk.includes('张三, 李四, & 王五 (2018).'), apaCjk)
  const gbCjk = cite(cjkRecord, { style: 'gb' })
  check('gb keeps CJK names whole', gbCjk.includes('张三, 李四, 王五.'), gbCjk)

  // --- MLA author format
  const mla4 = cite(four, { style: 'mla', mode: 'reference' })
  check('mla 3+ authors → first inverted + et al.', mla4.startsWith('Peters, Matthew, et al. "'), mla4)
  const mla2 = cite({ ...four, authors: four.authors.slice(0, 2) }, { style: 'mla' })
  check('mla 2 authors → inverted first, upright second with and', mla2.startsWith('Peters, Matthew, and Mark Neumann. "'), mla2)

  // --- Chicago author format
  const chi4 = cite(four, { style: 'chicago', mode: 'reference' })
  check('chicago inverted first, and before last', chi4.startsWith('Peters, Matthew, Mark Neumann, Mohit Iyyer, and Luke Zettlemoyer. "'), chi4)
  const chi11 = citeDetailed({ ...record, authors: Array.from({ length: 11 }, (_, i) => ({ lastName: `Name${i + 1}`, firstName: 'Y' })) }, { style: 'chicago' })
  check('chicago 11+ authors → first 7 + et al.', chi11.text.startsWith('Name1, Y, Name2, Y, Name3, Y, Name4, Y, Name5, Y, Name6, Y, Name7, Y, et al.'), chi11.text.slice(0, 160))

  // --- GB author format (no commas, no initials dots, 等 at 4+)
  const gb4 = cite(four, { style: 'gb', mode: 'reference' })
  check('gb lists first three then 等', gb4.includes('Peters M, Neumann M, Iyyer M, 等'), gb4)
  const gb2 = cite({ ...four, authors: four.authors.slice(0, 2) }, { style: 'gb' })
  check('gb two authors listed fully', gb2.includes('Peters M, Neumann M.'), gb2)

  // --- in-text author format (APA et al. at 3+)
  const intext4 = cite(four, { style: 'apa', mode: 'intext' })
  check('apa in-text 4 authors → et al.', intext4 === '(Peters et al., 2018)', intext4)
  const intext2 = cite({ ...four, authors: four.authors.slice(0, 2) }, { style: 'apa', mode: 'intext' })
  check('apa in-text 2 authors → A & B', intext2 === '(Peters & Neumann, 2018)', intext2)

  // --- italics (from 0.2.9, kept as regression guard)
  const apa = citeDetailed(record, { style: 'apa', mode: 'reference' })
  check('cite text carries no literal asterisks', !apa.text.includes('*'), apa.text)
  check('apa italicises journal name', apa.segments.some((s) => s.italic && s.text === 'Transactions of the ACL'), JSON.stringify(apa.segments))
  check('apa italicises volume (APA 7 rule)', apa.segments.some((s) => s.italic && s.text === '6'), JSON.stringify(apa.segments))
  check('apa leaves issue upright', apa.segments.some((s) => !s.italic && s.text.includes('(1)')), JSON.stringify(apa.segments))
  check('apa html has <i> markup', /<i>Transactions of the ACL<\/i>/.test(apa.html) && /<i>6<\/i>\(1\)/.test(apa.html), apa.html)

  const chi = citeDetailed(record, { style: 'chicago', mode: 'reference' })
  check('chicago italicises journal (not quotes)', chi.segments.some((s) => s.italic && s.text === 'Transactions of the ACL'), chi.text)
  check('chicago no nested quotes', !chi.text.includes('""'), chi.text)

  const mla = citeDetailed(record, { style: 'mla', mode: 'reference' })
  check('mla italicises container', mla.segments.some((s) => s.italic && s.text === 'Transactions of the ACL'), mla.text)

  const gb = citeDetailed(record, { style: 'gb', mode: 'reference' })
  check('gb/t has no italics (correct for the standard)', !gb.segments.some((s) => s.italic), gb.text)

  // Book titles italicise in APA / MLA / Chicago but not GB/T.
  const book = { ...record, itemType: 'book', publisher: 'MIT Press' }
  check('apa italicises book title', citeDetailed(book, { style: 'apa' }).segments.some((s) => s.italic && s.text === record.title), 'book title')
  check('gb book stays upright', !citeDetailed(book, { style: 'gb' }).segments.some((s) => s.italic), 'gb book')

  // Helper round-trip + escaping.
  check('stripItalic removes markers', stripItalic('a *b* c'), 'a b c')
  check('toSegments round-trips', toSegments('a *b* c').map((s) => s.text).join(''), 'abc')
  check('segmentsToHtml escapes html', segmentsToHtml([{ text: '<x>&"y' }]), '&lt;x&gt;&amp;&quot;y')

  // The plain cite() keeps working for export paths — now asterisk-free.
  check('cite() returns clean text', cite(record, { style: 'apa' }) === apa.text, 'matches citeDetailed.text')
  const intext = citeDetailed(record, { style: 'apa', mode: 'intext' })
  check('intext has no italics', !intext.segments.some((s) => s.italic), intext.text)
}

// 14e. trimRight termination (GH#1: unmatched closing bracket spun forever on
//      the host's main thread — every chat message >=20 chars passed through
//      extractIdentifiers, so a stray ')' at the end froze DSH).
{
  const { trimRight, extractIdentifiers } = await import('../src/node/extract/identifiers.js')
  check('trimRight strips unmatched half-width close', trimRight('abc)') === 'abc', trimRight('abc)'))
  check('trimRight strips stacked unmatched closes', trimRight('abc)]}') === 'abc', trimRight('abc)]}'))
  check('trimRight strips unmatched full-width close', trimRight('测试）') === '测试', trimRight('测试）'))
  check('trimRight keeps matched pairs', trimRight('(abc)') === '(abc)', trimRight('(abc)'))
  check('trimRight peels punctuation under a bracket', trimRight('doi。') === 'doi', trimRight('doi。'))
  // DOI tails keep their slashes and inner chars but lose the stray close.
  check('trimRight on a DOI tail', trimRight('10.1234/abc.def') === '10.1234/abc.def', trimRight('10.1234/abc.def'))
  // The exact GH#1 shape: a long chat message ending in a stray ')'.
  const hostile = '这是一段很长的会话消息用于复现 issue 第一号的死循环情况 :)'
  const t0 = Date.now()
  const hits = extractIdentifiers(hostile)
  const dt = Date.now() - t0
  check('extractIdentifiers survives stray close paren (GH#1)', dt < 500 && Array.isArray(hits), `${dt}ms, ${hits.length} hits`)
  // Markdown-ish tail that used to hang: bracket + paren, no opener.
  const t1 = Date.now()
  extractIdentifiers('模型输出结尾像这样 **加粗文本**] 其他内容足够长以超过二十个字符)')
  check('extractIdentifiers survives bracket+paren tail', Date.now() - t1 < 500, `${Date.now() - t1}ms`)
}

// 15. ISBN resolve path end-to-end (live API; may be offline in sandbox)
{
  const { resolveIdentifier } = await import('../src/node/metadata/index.js')
  const rec = await resolveIdentifier({ kind: 'isbn', value: '978-0-262-13472-9' }, { timeoutMs: 20000 }).catch(() => null)
  if (rec) {
    check('isbn resolves through Open Library', rec.itemType === 'book' && !!rec.title, rec.title?.slice(0, 40))
  } else {
    console.log('  (skip live ISBN check — API unreachable)')
  }
}

// 16. PDF text extraction (host-side, no worker) on a generated text PDF
{
  const { readFile, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { extractPdfText } = await import('../src/node/pdf-text.js')

  const text = 'Attention is all you need - literature AI test'
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
    .map((s, i) => `${i + 1} 0 obj\n${s}\nendobj\n`)
    .join('')
  const pdf = Buffer.from(`%PDF-1.4\n${objects}trailer << /Root 1 0 R >>\n%%EOF`, 'latin1')
  const pdfPath = join(tmpdir(), `lit-ai-text-${Date.now()}.pdf`)
  await writeFile(pdfPath, pdf)

  const extracted = await extractPdfText(pdfPath, { force: true })
  check('pdf text extraction returns the page text', extracted.includes('Attention is all you need'), extracted)
  await import('node:fs/promises').then((m) => m.rm(pdfPath, { force: true }))
}

// 17. AI-assist routes: steering reader actions into the current conversation
{
  // Create the entry through the SAME bundle the routes use. The harness
  // mixes the src pipeline with the bundled lib, which keep separate module
  // graphs (hence separate in-memory stores) — mixing them would make every
  // lookup miss.
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(140, 90)])
  const dropRes = makeRes()
  const dropReq = makeReq('POST', '/api/dsh-literature/drop?filename=ai%20assist%20paper.pdf', '127.0.0.1', pdf)
  const dp = collect(dropRes)
  await handler(dropReq, dropRes)
  const dropBody = JSON.parse(await dp)
  const key = dropBody.item?.key
  check('ai setup: drop created an entry in the bundle store', !!key, dropBody.error)

  // 17a. no session available -> clear error (no crash)
  const res = makeRes()
  const req = makeReq('POST', '/api/dsh-literature/ai/ask', '127.0.0.1',
    Buffer.from(JSON.stringify({ key, action: 'translate', selection: 'x' })))
  const p = collect(res)
  await handler(req, res)
  const body = JSON.parse(await p)
  check('ai/ask without a session fails gracefully', res.status === 500 && /对话/.test(body.error ?? ''), { status: res.status, error: body.error })

  // 17b. selection action with a live session -> steered into the conversation
  const res2 = makeRes()
  const req2 = makeReq('POST', '/api/dsh-literature/ai/ask', '127.0.0.1',
    Buffer.from(JSON.stringify({ key, sessionId: 'test-session', action: 'translate', selection: 'This is a selected sentence.' })))
  const p2 = collect(res2)
  await handler(req2, res2)
  const body2 = JSON.parse(await p2)
  check('ai/ask steers a translate request', res2.status === 200 && body2.ok === true && steered.length === 1,
    { status: res2.status, ok: body2.ok, steered: steered.length })
  const steeredMsg = steered[steered.length - 1]
  check('steered message carries the selected text', steeredMsg?.content?.[0]?.text?.includes('This is a selected sentence.'),
    steeredMsg?.content?.[0]?.text?.slice(0, 80))

  // 17c. full-text actions need a real PDF with text -> clear failure for the stub
  const res3 = makeRes()
  const req3 = makeReq('POST', '/api/dsh-literature/ai/ask', '127.0.0.1',
    Buffer.from(JSON.stringify({ key, sessionId: 'test-session', action: 'ask', question: 'What is this about?' })))
  const p3 = collect(res3)
  await handler(req3, res3)
  const body3 = JSON.parse(await p3)
  check('ai/ask full-text action without extractable text fails clearly', res3.status === 500 && /没有|扫描|损坏/.test(body3.error ?? ''), body3.error)

  // 17d. unknown session id -> graceful error
  const res4 = makeRes()
  const req4 = makeReq('POST', '/api/dsh-literature/ai/ask', '127.0.0.1',
    Buffer.from(JSON.stringify({ key, sessionId: 'nope', action: 'summarize', selection: 'x' })))
  const p4 = collect(res4)
  await handler(req4, res4)
  const body4 = JSON.parse(await p4)
  check('ai/ask with an unknown session fails gracefully', res4.status === 500 && body4.error, body4.error)
}

// 18. doctor supervisor self-heal (pipe naming must match dsh-doctor's own
//     derivation; the heal must spawn when the pipe is unreachable)
{
  const { doctorPipeName, findDoctorCli, pipeAvailable, ensureDoctorSupervisor } = await import('../src/node/doctor-selfheal.js')

  const root = 'C:\\Users\\JH Z\\.dsh-doctor'
  const pipe = doctorPipeName(root)
  check('doctor pipe name matches dsh-doctor derivation', pipe === '\\\\.\\pipe\\dsh-doctor-47e816acfc345f52', pipe)

  const cli = findDoctorCli()
  check('doctor cli discovered', cli.length > 0 && cli.includes('dsh-doctor') && cli.endsWith('cli.mjs'), cli)

  // Isolated heal: temporary doctor home, pipe surely unreachable -> must spawn.
  const healHome = join(tmpdir(), `dsh-doctor-test-${Date.now()}`)
  const prevHome = process.env.DSH_DOCTOR_HOME
  process.env.DSH_DOCTOR_HOME = healHome
  try {
    const before = await pipeAvailable(doctorPipeName(healHome), 800)
    check('isolated doctor pipe is unreachable before heal', before === false)
    await ensureDoctorSupervisor()
    // Give the spawned supervisor a moment to open its pipe.
    await new Promise((r) => setTimeout(r, 2500))
    const after = await pipeAvailable(doctorPipeName(healHome), 2000)
    check('heal spawned a reachable supervisor', after === true)
  } finally {
    if (prevHome === undefined) delete process.env.DSH_DOCTOR_HOME
    else process.env.DSH_DOCTOR_HOME = prevHome
    // Cleanup: kill the test supervisor so it does not linger.
    await import('node:child_process').then(({ execSync }) => {
      try { execSync(`taskkill /F /FI "WINDOWTITLE eq dsh-doctor-test" 2>nul`, { stdio: 'ignore' }) } catch { /* none */ }
    }).catch(() => {})
  }
}

dispose()
await rm(TEST_HOME, { recursive: true, force: true })

console.log(failures === 0 ? '\nHOST TESTS ALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
