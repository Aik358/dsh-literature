import { randomUUID } from 'node:crypto'
import { loadConfig } from '../config.js'
import { baseUrl, connectorHeaders, ensureZotero } from './health.js'
import { log, warn } from '../log.js'

/**
 * The only supported write path into Zotero. Its Local API is read-only by
 * design, so we speak the same protocol the browser connector uses:
 *
 *   1. POST /connector/saveItems          create the parent item
 *   2. POST /connector/saveAttachment     stream the PDF onto that parent
 *
 * Both calls share one `sessionID`, and step 2 looks the parent up through the
 * client-side `id` we stamped onto the item in step 1.
 *
 * Two limitations are inherent to this API and must be surfaced to the user
 * rather than papered over:
 *   - the save target is whatever library/collection is selected in Zotero;
 *     it cannot be passed in the request
 *   - `X-Metadata` is not in the server's CORS allow-list, so this sequence
 *     can only ever run from the host process, never from the browser
 */

async function request(path, { method = 'POST', body, headers = {}, timeoutMs = 60000 } = {}) {
  await ensureZotero()
  const config = await loadConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl(config.zoteroPort)}${path}`, {
      method,
      headers: connectorHeaders(headers),
      body,
      signal: controller.signal,
    })
    return res
  } catch (e) {
    if (e?.name === 'AbortError') throw Object.assign(new Error(`Zotero 请求超时（${path}）`), { code: 'timeout' })
    throw Object.assign(new Error(`无法连接 Zotero（${path}）：${e.message}`), { code: 'network' })
  } finally {
    clearTimeout(timer)
  }
}

async function postJson(path, payload, options) {
  const res = await request(path, { body: JSON.stringify(payload), ...options })
  const text = await res.text().catch(() => '')
  if (res.status === 409) {
    throw Object.assign(new Error('Zotero 会话冲突，请重试'), { code: 'session_exists' })
  }
  if (res.status >= 400) {
    let detail = text
    try {
      detail = JSON.parse(text)?.error ?? text
    } catch {
      /* keep raw text */
    }
    throw Object.assign(new Error(`Zotero 返回 ${res.status}: ${detail}`), { code: 'zotero_error', status: res.status })
  }
  return { status: res.status, body: text }
}

/**
 * GH#3: HTTP header values must be ByteStrings (every char code <= 255), but
 * the attachment metadata carries the paper title — and real titles contain
 * characters like U+2212 (math minus, "LiFe1−xCoxAs"), which blew up
 * `http` with "Cannot convert argument to a ByteString". Encoding every
 * non-Latin-1 char as a JSON `\uXXXX` escape keeps the payload byte-legal
 * while JSON.parse on the Zotero side still reconstructs the exact string.
 */
function asciiJson(value) {
  return JSON.stringify(value).replace(/[^\x00-\xFF]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
}

async function postBuffer(path, buffer, { metadata, contentType, timeoutMs }) {
  // Content-Length is a forbidden header on WHATWG fetch() bodies — undici
  // recomputes it, so setting it manually is dead weight at best.
  const headers = {
    'Content-Type': contentType,
  }
  if (metadata) headers['X-Metadata'] = asciiJson(metadata)

  const res = await request(path, { body: buffer, headers, timeoutMs })
  const text = await res.text().catch(() => '')
  if (res.status >= 400) {
    let detail = text
    try {
      detail = JSON.parse(text)?.error ?? text
    } catch {
      /* keep raw text */
    }
    throw Object.assign(new Error(`Zotero 附件写入失败 ${res.status}: ${detail}`), { code: 'zotero_error', status: res.status })
  }
  return { status: res.status, body: text }
}

/**
 * @param {object} args
 * @param {object} args.item  Zotero item JSON from `toZoteroItem` (carries `id`)
 * @param {Buffer} [args.pdfBuffer]
 * @param {string} [args.pdfFileName]
 * @param {string} [args.pdfUrl]
 * @param {string} [args.sessionID]
 */
export async function saveToZotero({ item, pdfBuffer, pdfFileName, pdfUrl, sessionID = randomUUID(), timeoutMs = 60000 }) {
  await postJson('/connector/saveItems', { sessionID, items: [item], uri: pdfUrl || item.url || '' }, { timeoutMs: 30000 })

  let attachmentSaved = false
  if (pdfBuffer && pdfBuffer.length) {
    const metadata = {
      sessionID,
      parentItemID: item.id,
      title: pdfFileName || 'Full Text PDF',
      url: pdfUrl || item.url || '',
    }
    await postBuffer(`/connector/saveAttachment?sessionID=${encodeURIComponent(sessionID)}`, pdfBuffer, {
      metadata,
      contentType: 'application/pdf',
      timeoutMs,
    })
    attachmentSaved = true
  }

  log(`saved to Zotero: ${item.title} (attachment: ${attachmentSaved})`)
  return { sessionID, attachmentSaved }
}

/** Which library/collection Zotero would save into right now. */
export async function getSelectedCollection() {
  const res = await request('/connector/getSelectedCollection', { body: JSON.stringify({}), timeoutMs: 4000 })
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function pingConnector() {
  try {
    const res = await request('/connector/ping', { body: JSON.stringify({ activeURL: '' }), timeoutMs: 4000 })
    return res.ok
  } catch (e) {
    warn('connector ping failed:', e.message)
    return false
  }
}
