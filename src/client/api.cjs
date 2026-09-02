/**
 * Thin client for the plugin's own loopback routes. Zotero's HTTP server only
 * sends CORS headers to the bookmarklet origin, so the browser can never talk
 * to Zotero directly — every read and write is proxied by the host.
 */

const BASE = '/api/dsh-literature'

// Every request gets a hard timeout: a hung host (or a wedged route) must
// surface as an error, never as an eternal spinner / dead click. 15s is far
// beyond anything a loopback route needs.
const REQUEST_TIMEOUT_MS = 15000

async function request(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (e) {
    // A local timeout is generated here, so it carries its own code; the
    // display layer translates it (see localizeError).
    if (e?.name === 'AbortError' && !signal?.aborted) throw httpError('Request timed out', 'timeout')
    throw httpError(e?.message ?? String(e))
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
  const text = await res.text()
  let parsed = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  // Attach the server's stable code so the message can be translated instead
  // of being shown verbatim (which would leak Chinese into an English UI).
  if (!res.ok) throw httpError(parsed.error || `${method} ${path} -> HTTP ${res.status}`, parsed.code)
  return parsed
}

function httpError(message, code) {
  const err = new Error(message)
  if (code) err.code = code
  return err
}

const api = {
  state: () => request('/state'),
  config: () => request('/config'),
  saveConfig: (patch) => request('/config', { method: 'POST', body: patch }),
  scan: (text) => request('/scan', { method: 'POST', body: { text } }),
  resolve: (key) => request('/resolve', { method: 'POST', body: { key } }),
  fetch: (key) => request('/fetch', { method: 'POST', body: { key } }),
  save: (key, opts = {}) => request('/save', { method: 'POST', body: { key, ...opts } }),
  retry: (key) => request('/retry', { method: 'POST', body: { key } }),
  diff: (key) => request('/diff', { method: 'POST', body: { key } }),
  discard: (key) => request('/discard', { method: 'POST', body: { key } }),
  /** Partial update of an item (reader progress, tags, ...). */
  patchItem: (key, patch) => request(`/item/${encodeURIComponent(key)}`, { method: 'PATCH', body: { patch } }),
  /** Markdown export of a reader's highlights + notes. */
  exportNotes: (key) => request(`/export-notes/${encodeURIComponent(key)}`),
  /** Multi-item export (ris | bibtex | csl-json) as one file payload. */
  exportBatch: (keys, format) => request('/export-batch', { method: 'POST', body: { keys, format } }),

  cite: (key, opts = {}) => request('/cite', { method: 'POST', body: { key, ...opts } }),
  scanDir: (dir) => request('/scan-dir', { method: 'POST', body: { dir } }),
  importZotero: (limit = 50) => request('/import-zotero', { method: 'POST', body: { limit } }),
  searchCandidates: (q, rows = 8) => request('/search', { method: 'POST', body: { q, rows } }),
  addCandidate: (candidate) => request('/add-candidate', { method: 'POST', body: { candidate } }),
  dropPdf: async (file) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res
    try {
      res = await fetch(`${BASE}/drop?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/pdf' },
        body: file,
        signal: controller.signal,
      })
    } catch (e) {
      if (e?.name === 'AbortError') throw httpError('Upload timed out', 'uploadTimeout')
      throw e
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    let parsed = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = {}
    }
    if (!res.ok) throw httpError(parsed.error || `drop -> HTTP ${res.status}`, parsed.code)
    return parsed
  },
  /** Uploads a locally-downloaded PDF for a paywalled / needs-login entry. */
  importPdf: async (key, file, { autoSave = true } = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res
    try {
      res = await fetch(`${BASE}/import?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(file.name)}&autoSave=${autoSave ? 1 : 0}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/pdf' },
        body: file,
        signal: controller.signal,
      })
    } catch (e) {
      if (e?.name === 'AbortError') throw httpError('Upload timed out', 'uploadTimeout')
      throw e
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    let parsed = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = {}
    }
    if (!res.ok) throw httpError(parsed.error || `import -> HTTP ${res.status}`, parsed.code)
    return parsed
  },
  zoteroCollections: () => request('/zotero/collections?selected=1'),
  zoteroItems: (q) => request(`/zotero/items?q=${encodeURIComponent(q || '')}&limit=25`),
  annotations: (key) => request(`/annotations/${encodeURIComponent(key)}`),
  addAnnotation: (key, body) => request(`/annotations/${encodeURIComponent(key)}`, { method: 'POST', body }),
  patchAnnotation: (key, id, patch) => request(`/annotations/${encodeURIComponent(key)}`, { method: 'PATCH', body: { id, patch } }),
  removeAnnotation: (key, id) => request(`/annotations/${encodeURIComponent(key)}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  pdfUrl: (key) => `${BASE}/pdf/${encodeURIComponent(key)}`,
  zoteroPdfUrl: (key) => `${BASE}/zotero/file/${encodeURIComponent(key)}`,
  /** AI assist: steers a reader question into the current DSH conversation. */
  aiAsk: (payload) => request('/ai/ask', { method: 'POST', body: payload }),
  aiSession: () => request('/ai/session'),
}

/**
 * Server-sent events for progress. `EventSource` reconnects on its own; the
 * host also sends a `retry:` directive so it backs off after a restart.
 *
 * Connection-pool safety: every SSE holds one browser HTTP connection, and
 * browsers cap same-origin connections at ~6. If the host (or another plugin)
 * wedges a stream, the EventSource retries in a loop and leaks connections —
 * which makes every other request queue and time out. So after 3 consecutive
 * drop/reconnect failures we degrade to a light 15s poll of `/state` and give
 * the connection back. A stable stream resets the counter on any message.
 */
function subscribe(onEvent, onError) {
  let pollTimer = null
  let es = null
  let esErrors = 0
  let closed = false

  const cleanup = () => {
    closed = true
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (es) {
      try {
        es.close()
      } catch {
        /* already closed */
      }
      es = null
    }
  }

  const startPolling = () => {
    if (closed || pollTimer) return
    if (es) {
      try {
        es.close()
      } catch {
        /* ignore */
      }
      es = null
    }
    console.warn('[dsh-literature] SSE degraded to 15s polling (connection pool pressure)')
    const tick = async () => {
      if (closed) return
      try {
        const snapshot = await api.state()
        if (!closed) onEvent?.('poll', snapshot)
      } catch {
        /* transient — keep polling */
      }
    }
    tick()
    pollTimer = setInterval(tick, 15000)
  }

  if (typeof EventSource === 'undefined') {
    startPolling()
    return cleanup
  }

  const open = () => {
    if (closed) return
    es = new EventSource(`${BASE}/events`)
    const types = ['item', 'task', 'status', 'removed', 'hello']
    for (const type of types) {
      es.addEventListener(type, (e) => {
        // Any real event means the stream is healthy — reset the drop counter.
        esErrors = 0
        let data = {}
        try {
          data = JSON.parse(e.data)
        } catch {
          data = {}
        }
        onEvent?.(type, data)
      })
    }
    es.onerror = () => {
      if (closed) return
      esErrors += 1
      onError?.()
      if (esErrors >= 3) startPolling()
    }
  }
  open()

  return cleanup
}

module.exports = { api, subscribe, BASE }
