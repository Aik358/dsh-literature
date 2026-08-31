import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { isLoopbackRequest, writeJson, writeSseHead, parseRange, responseClosed, readRawBody } from './http.js'
import { loadConfig, saveConfig, PDF_DIR } from './config.js'
import * as store from './store/db.js'
import * as pipeline from './pipeline.js'
import * as sse from './sse.js'
import { noteSession } from './session-track.js'
import { describe, ping } from './zotero/health.js'
import { listCollections, searchItems, getFileBuffer } from './zotero/local-api.js'
import { getSelectedCollection } from './zotero/connector.js'
import { log, warn } from './log.js'

const PREFIX = '/api/dsh-literature'

/**
 * One prefix route, dispatched internally. Registering a single prefix keeps us
 * clear of the server's exact-table matching and lets us shape the responses
 * (SSE, byte ranges, JSON) without fighting a generic wrapper.
 */

function pathOf(req) {
  const u = new URL(req.url ?? '/', 'http://127.0.0.1')
  return u.pathname
}

function methodOk(req, ...allowed) {
  return allowed.includes(req.method)
}

/** Guards against `..` in a key that is used to build a filesystem path. */
function safePdfPath(key) {
  const base = resolve(PDF_DIR)
  const candidate = resolve(base, `${String(key).replace(/[^\w.-]+/g, '_')}.pdf`)
  if (!candidate.startsWith(base)) return null
  return candidate
}

async function handleState(res) {
  const config = await loadConfig()
  const zotero = await describe()
  const items = await store.listItems()
  const tasks = await store.listTasks().then((all) => all.filter((t) => t.state === 'running'))
  let selectedCollection = null
  if (zotero.running) {
    selectedCollection = await getSelectedCollection().catch(() => null)
  }
  writeJson(res, 200, { config, zotero, items, tasks, selectedCollection })
}

async function handleEvents(req, res) {
  writeSseHead(res)
  const remove = sse.addClient(res)
  sse.emit('hello', { ok: true, clients: sse.clientCount() })
  try {
    await responseClosed(res)
  } catch {
    /* socket vanished */
  } finally {
    remove()
  }
}

async function servePdf(req, res, key) {
  // The key travels URL-encoded (spaces -> %20 etc.); titles with spaces and
  // punctuation must be decoded before it can be mapped to the stored file.
  let decoded = key
  try {
    decoded = decodeURIComponent(key)
  } catch {
    /* keep as-is */
  }
  const path = safePdfPath(decoded)
  if (!path) {
    writeJson(res, 400, { error: 'invalid key' })
    return
  }
  let buffer
  try {
    buffer = await readFile(path)
  } catch {
    writeJson(res, 404, { error: 'pdf not downloaded yet' })
    return
  }

  const range = parseRange(req.headers.range, buffer.length)
  if (range?.invalid) {
    res.writeHead(416, { 'content-range': `bytes */${buffer.length}`, 'content-length': 0 })
    res.end()
    return
  }

  if (range) {
    const slice = buffer.subarray(range.start, range.end + 1)
    res.writeHead(206, {
      'content-type': 'application/pdf',
      'content-length': slice.length,
      'content-range': `bytes ${range.start}-${range.end}/${buffer.length}`,
      'accept-ranges': 'bytes',
    })
    res.end(req.method === 'HEAD' ? undefined : slice)
    return
  }

  res.writeHead(200, {
    'content-type': 'application/pdf',
    'content-length': buffer.length,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=300',
  })
  res.end(req.method === 'HEAD' ? undefined : buffer)
}

/** PDF bytes for a library item, proxied from Zotero's own read-only file endpoint. */
async function serveZoteroPdf(req, res, key) {
  try {
    const { buffer } = await getFileBuffer(key)
    // pdf.js issues Range requests by default; honour them like the local
    // servePdf path does, and answer HEAD without shipping the body.
    const range = parseRange(req.headers.range, buffer.length)
    if (range?.invalid) {
      res.writeHead(416, { 'content-range': `bytes */${buffer.length}`, 'content-length': 0 })
      res.end()
      return
    }
    if (range) {
      const slice = buffer.subarray(range.start, range.end + 1)
      res.writeHead(206, {
        'content-type': 'application/pdf',
        'content-length': slice.length,
        'content-range': `bytes ${range.start}-${range.end}/${buffer.length}`,
        'accept-ranges': 'bytes',
      })
      res.end(req.method === 'HEAD' ? undefined : slice)
      return
    }
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-length': buffer.length,
      'accept-ranges': 'bytes',
    })
    res.end(req.method === 'HEAD' ? undefined : buffer)
  } catch (e) {
    writeJson(res, 502, { error: e.message })
  }
}

async function handleAnnotations(req, res, key) {
  // The key travels URL-encoded (spaces -> %20). Decode once so annotations
  // are stored under the SAME key as the item itself — otherwise discarding
  // an item (which deletes by the raw key) would leak orphaned annotations.
  let decoded = key
  try {
    decoded = decodeURIComponent(key)
  } catch {
    /* keep as-is */
  }
  if (req.method === 'GET') {
    writeJson(res, 200, { annotations: await store.getAnnotations(decoded) })
    return
  }
  const body = await readJsonBody(req)
  if (req.method === 'POST') {
    const created = await store.addAnnotation(decoded, body ?? {})
    writeJson(res, 201, { annotation: created })
    return
  }
  if (req.method === 'PATCH') {
    const updated = await store.patchAnnotation(decoded, body?.id, body?.patch ?? {})
    writeJson(res, 200, { annotation: updated })
    return
  }
  if (req.method === 'DELETE') {
    const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('id')
    await store.removeAnnotation(decoded, id)
    writeJson(res, 200, { ok: true })
    return
  }
  writeJson(res, 405, { error: 'method not allowed' })
}

async function readJsonBody(req) {
  const { readJsonBody: read } = await import('./http.js')
  return read(req)
}

export async function handler(req, res, ctx) {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return
  }

  const path = pathOf(req)
  if (!path.startsWith(PREFIX)) {
    writeJson(res, 404, { error: 'not found' })
    return
  }
  const rest = path.slice(PREFIX.length).replace(/^\/+/, '')
  const parts = rest.split('/').filter(Boolean)
  const head = parts[0] ?? ''

  try {
    if (head === 'events' && methodOk(req, 'GET')) {
      await handleEvents(req, res)
      return
    }

    if (head === 'state' && methodOk(req, 'GET')) {
      await handleState(res)
      return
    }

    if (head === 'config' && methodOk(req, 'GET', 'POST')) {
      if (req.method === 'POST') {
        const patch = await readJsonBody(req)
        const next = await saveConfig(patch ?? {})
        writeJson(res, 200, { config: next })
      } else {
        writeJson(res, 200, { config: await loadConfig() })
      }
      return
    }

    if (head === 'scan' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const created = await pipeline.scanText(String(body?.text ?? ''))
      writeJson(res, 200, { created })
      return
    }

    if (head === 'resolve' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await pipeline.resolveItem(String(body?.key ?? ''))
      writeJson(res, 200, { item })
      return
    }

    if (head === 'fetch' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await pipeline.fetchItemPdf(String(body?.key ?? ''))
      writeJson(res, 200, { item })
      return
    }

    if (head === 'retry' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await pipeline.retryItem(String(body?.key ?? ''))
      writeJson(res, 200, { item })
      return
    }

    if (head === 'save' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await pipeline.saveItem(String(body?.key ?? ''), { mode: body?.mode, tags: body?.tags })
      writeJson(res, 200, { item })
      return
    }

    if (head === 'diff' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const conflict = await pipeline.previewConflict(String(body?.key ?? ''))
      writeJson(res, 200, { conflict })
      return
    }

    if (head === 'discard' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      await pipeline.discardItem(String(body?.key ?? ''))
      writeJson(res, 200, { ok: true })
      return
    }

    if (head === 'cite' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await store.getItem(String(body?.key ?? ''))
      if (!item?.record) {
        writeJson(res, 404, { error: '条目缺少元数据，无法生成引用' })
        return
      }
      const { cite } = await import('./cite.js')
      const text = cite(item.record, {
        style: body?.style ?? 'apa',
        mode: body?.mode ?? 'reference',
        pages: body?.pages,
      })
      writeJson(res, 200, { text, style: body?.style ?? 'apa', mode: body?.mode ?? 'reference' })
      return
    }

    if (head === 'scan-dir' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const { importDir } = await import('./importer.js')
      const config = await loadConfig()
      const dir = typeof body?.dir === 'string' && body.dir.trim() ? body.dir.trim() : config.importDir
      const result = await importDir(dir, { autoResolve: body?.autoResolve !== false })
      writeJson(res, 200, result)
      return
    }

    if (head === 'search' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const rows = Number(body?.rows)
      const candidates = await pipeline.searchCandidates(String(body?.q ?? ''), Number.isFinite(rows) ? rows : 8)
      writeJson(res, 200, { candidates })
      return
    }

    if (head === 'add-candidate' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const item = await pipeline.addCandidate(body?.candidate ?? {})
      writeJson(res, 200, { item })
      return
    }

    if (head === 'drop' && methodOk(req, 'POST')) {
      // Drag-and-drop import: raw PDF bytes in the body, filename in the query.
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const filename = url.searchParams.get('filename') || 'dropped.pdf'
      const buffer = await readRawBody(req, 128 * 1024 * 1024)
      const item = await pipeline.importDroppedPdf(buffer, { filename })
      writeJson(res, 200, { item })
      return
    }

    if (head === 'import-zotero' && methodOk(req, 'POST')) {
      const body = await readJsonBody(req)
      const { importFromZotero } = await import('./importer.js')
      const limit = Number(body?.limit)
      const result = await importFromZotero({ limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50 })
      writeJson(res, 200, result)
      return
    }

    if (head === 'import' && methodOk(req, 'POST')) {
      // Paywalled / needs-login fallback: the user downloads the PDF in their
      // own browser and hands it to the panel. Body is the raw PDF bytes.
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const key = url.searchParams.get('key') ?? ''
      const filename = url.searchParams.get('filename') || 'imported.pdf'
      const autoSave = url.searchParams.get('autoSave') !== '0'
      if (!key) {
        writeJson(res, 400, { error: 'missing key' })
        return
      }
      const buffer = await readRawBody(req, 128 * 1024 * 1024)
      const item = await pipeline.importPdf(key, buffer, { filename, autoSave })
      writeJson(res, 200, { item })
      return
    }

    if (head === 'pdf' && parts[1] && methodOk(req, 'GET', 'HEAD')) {
      await servePdf(req, res, parts[1])
      return
    }

    if (head === 'zotero') {
      const sub = parts[1] ?? ''
      if (sub === 'collections' && methodOk(req, 'GET')) {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const items = await listCollections()
        writeJson(res, 200, { collections: items, selected: url.searchParams.get('selected') === '1' ? await getSelectedCollection().catch(() => null) : null })
        return
      }
      if (sub === 'items' && methodOk(req, 'GET')) {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const q = url.searchParams.get('q') ?? ''
        const items = await searchItems(q, { limit: Number(url.searchParams.get('limit') ?? 25) })
        writeJson(res, 200, { items })
        return
      }
      if (sub === 'file' && parts[2] && methodOk(req, 'GET', 'HEAD')) {
        await serveZoteroPdf(req, res, parts[2])
        return
      }
      if (sub === 'ping' && methodOk(req, 'GET')) {
        writeJson(res, 200, { status: await ping() })
        return
      }
    }

    if (head === 'annotations' && parts[1] && methodOk(req, 'GET', 'POST', 'PATCH', 'DELETE')) {
      await handleAnnotations(req, res, parts[1])
      return
    }

    if (head === 'ai') {
      const sub = parts[1] ?? ''
      if (sub === 'ask' && methodOk(req, 'POST')) {
        const body = await readJsonBody(req)
        const { askAi } = await import('./ai.js')
        const result = await askAi(ctx, {
          key: String(body?.key ?? ''),
          action: String(body?.action ?? 'ask'),
          question: String(body?.question ?? ''),
          selection: String(body?.selection ?? ''),
          sessionId: body?.sessionId ? String(body.sessionId) : null,
        })
        writeJson(res, 200, result)
        return
      }
      if (sub === 'session' && methodOk(req, 'GET')) {
        const { recentSession } = await import('./ai.js')
        writeJson(res, 200, { sessionId: recentSession() })
        return
      }
    }

    writeJson(res, 404, { error: `unknown route: ${path}` })
  } catch (e) {
    warn(`route ${path} failed:`, e?.stack ?? e)
    if (!res.headersSent) writeJson(res, 500, { error: e?.message ?? 'internal error' })
    else res.end()
  }
}

export function registerRoutes(ctx) {
  const disposers = [ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: (req, res) => handler(req, res, ctx) })]
  // Keep the AI-assist fallback session fresh: whichever session saw the most
  // recent activity is the one reader actions land in when the browser does
  // not supply an explicit id. Uses the zero-dependency session-track module —
  // a heavyweight import chain here (e.g. loading pdf.js) would block the
  // host's event loop on every chat event.
  if (typeof ctx.on === 'function') {
    disposers.push(
      ctx.on('session/event', (session) => {
        noteSession(session)
      }),
    )
  }
  log(`routes mounted at ${PREFIX}/`)
  return disposers
}
