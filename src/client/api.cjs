/**
 * Thin client for the plugin's own loopback routes. Zotero's HTTP server only
 * sends CORS headers to the bookmarklet origin, so the browser can never talk
 * to Zotero directly — every read and write is proxied by the host.
 */

const BASE = '/api/dsh-literature'

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  const text = await res.text()
  let parsed = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  if (!res.ok) throw new Error(parsed.error || `${method} ${path} -> HTTP ${res.status}`)
  return parsed
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
  cite: (key, opts = {}) => request('/cite', { method: 'POST', body: { key, ...opts } }),
  scanDir: (dir) => request('/scan-dir', { method: 'POST', body: { dir } }),
  importZotero: (limit = 50) => request('/import-zotero', { method: 'POST', body: { limit } }),
  /** Uploads a locally-downloaded PDF for a paywalled / needs-login entry. */
  importPdf: async (key, file, { autoSave = true } = {}) => {
    const res = await fetch(`${BASE}/import?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(file.name)}&autoSave=${autoSave ? 1 : 0}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/pdf' },
      body: file,
    })
    const text = await res.text()
    let parsed = {}
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = {}
    }
    if (!res.ok) throw new Error(parsed.error || `import -> HTTP ${res.status}`)
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
}

/**
 * Server-sent events for progress. `EventSource` reconnects on its own; the
 * host also sends a `retry:` directive so it backs off after a restart.
 */
function subscribe(onEvent, onError) {
  if (typeof EventSource === 'undefined') return () => {}
  const es = new EventSource(`${BASE}/events`)
  const types = ['item', 'task', 'status', 'removed', 'hello']
  const handlers = []
  for (const type of types) {
    const fn = (e) => {
      let data = {}
      try {
        data = JSON.parse(e.data)
      } catch {
        data = {}
      }
      onEvent?.(type, data)
    }
    es.addEventListener(type, fn)
    handlers.push([type, fn])
  }
  if (onError) es.onerror = onError
  return () => {
    for (const [type, fn] of handlers) es.removeEventListener(type, fn)
    es.close()
  }
}

module.exports = { api, subscribe, BASE }
