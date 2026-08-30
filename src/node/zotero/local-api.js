import { loadConfig } from '../config.js'
import { httpGetJson, httpGetBuffer, FetchFailure } from '../net.js'
import { baseUrl, ensureZotero } from './health.js'
import { warn } from '../log.js'

/**
 * Read-only access to the local Zotero library over its v3 Local API.
 * `Write access is not yet supported` per Zotero's own source, so every method
 * here is a GET.
 */

function apiHeaders() {
  return { 'Zotero-API-Version': '3' }
}

async function call(path, { timeoutMs = 10000, headers = {} } = {}) {
  await ensureZotero()
  const config = await loadConfig()
  return httpGetJson(`${baseUrl(config.zoteroPort)}${path}`, { timeoutMs, headers: { ...apiHeaders(), ...headers } })
}

/** Local API responses use the web API v3 envelope: `{ key, data, ... }`. */
function unwrap(entry) {
  return entry?.data ?? entry
}

export async function searchItems(query, { limit = 25, qmode = 'everything' } = {}) {
  const params = new URLSearchParams({ format: 'json', qmode })
  if (query) params.set('q', query)
  if (limit) params.set('limit', String(limit))
  const body = await call(`/api/users/0/items?${params}`)
  return Array.isArray(body) ? body.map(unwrap) : [unwrap(body)]
}

export async function getItemJson(key) {
  const body = await call(`/api/users/0/items/${encodeURIComponent(key)}?format=json`)
  return unwrap(body)
}

export async function getItemChildren(key) {
  const body = await call(`/api/users/0/items/${encodeURIComponent(key)}/children?format=json`)
  return Array.isArray(body) ? body.map(unwrap) : []
}

export async function listCollections() {
  const body = await call('/api/users/0/collections?format=json')
  return Array.isArray(body) ? body.map(unwrap) : []
}

export async function listTags({ limit = 100 } = {}) {
  const body = await call(`/api/users/0/tags?format=json&limit=${limit}`)
  return Array.isArray(body) ? body.map(unwrap) : []
}

export async function getFileBuffer(key) {
  await ensureZotero()
  const config = await loadConfig()
  return httpGetBuffer(`${baseUrl(config.zoteroPort)}/api/users/0/items/${encodeURIComponent(key)}/file`, { timeoutMs: 60000 })
}

export async function getFulltext(key) {
  try {
    const body = await call(`/api/users/0/items/${encodeURIComponent(key)}/fulltext`)
    return body?.content ?? ''
  } catch (e) {
    if (e?.status === 404) return ''
    throw e
  }
}

/**
 * Looks for existing library entries that look like the same work. The Local
 * API has no field-scoped query, so we search then verify client-side.
 */
export async function findDuplicates({ doi, arxiv, title }) {
  const queries = []
  if (doi) queries.push({ field: 'DOI', value: String(doi).toLowerCase() })
  if (arxiv) queries.push({ field: 'extra', value: String(arxiv).toLowerCase() })

  const hits = []
  const seen = new Set()

  for (const q of queries) {
    try {
      const items = await searchItems(q.value, { limit: 25 })
      for (const item of items) {
        const itemDoi = String(item.DOI ?? '').toLowerCase()
        const extra = String(item.extra ?? '').toLowerCase()
        const matched = q.field === 'DOI' ? itemDoi === q.value : extra.includes(q.value)
        if (!matched) continue
        if (seen.has(item.key)) continue
        seen.add(item.key)
        hits.push(item)
      }
    } catch (e) {
      warn(`duplicate search failed for ${q.field}:`, e.message)
    }
  }

  if (!hits.length && title) {
    try {
      const items = await searchItems(title.slice(0, 80), { limit: 10, qmode: 'titleCreatorYear' })
      for (const item of items) {
        const a = String(item.title ?? '').toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ')
        const b = String(title).toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ')
        if (!a || !b) continue
        if (a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40))) {
          if (seen.has(item.key)) continue
          seen.add(item.key)
          hits.push(item)
        }
      }
    } catch (e) {
      warn('title duplicate search failed:', e.message)
    }
  }

  return hits
}

export { FetchFailure }
