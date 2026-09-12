import { warn } from './log.js'

const UA = 'dsh-literature/0.3.6 (+https://github.com/deepseek-ai/deepseek-harness)'

/**
 * Response-body budgets. Every outbound body is read through a byte cap so a
 * hostile or misbehaving source can never OOM the shared DSH host process.
 */
export const MAX_BODY_BYTES = {
  json: 20 * 1024 * 1024,
  text: 20 * 1024 * 1024,
  buffer: 256 * 1024 * 1024,
}

const MAX_REDIRECTS = 5

export class FetchFailure extends Error {
  constructor(message, { code = 'network', status = 0, retryable = true, cause } = {}) {
    super(message, { cause })
    this.name = 'FetchFailure'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

/**
 * True for hostname literals that resolve into private/loopback/link-local
 * space. This is a literal check only (no DNS resolution): it stops trivial
 * internal probing; a DNS name that resolves into private space is a
 * documented residual.
 */
export function isPrivateHostLiteral(host) {
  const h = String(host ?? '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (h.startsWith('[')) {
    // IPv6 literal: loopback, unique-local (fc00::/7), link-local (fe80::/10).
    const v6 = h.slice(1, h.includes(']') ? h.indexOf(']') : undefined)
    return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6)
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if ([a, b, Number(m[3]), Number(m[4])].some((o) => o > 255)) return false
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

/**
 * Fetch-target gate: http(s) only, and no private/loopback/link-local
 * literal targets unless the caller explicitly opts in (`allowPrivate` is
 * reserved for services the user runs locally — the Zotero connector — and
 * for user-configured custom download sources).
 */
export function assertFetchableUrl(url, { allowPrivate = false } = {}) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    throw new FetchFailure(`invalid URL: ${url}`, { code: 'bad_url', retryable: false })
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new FetchFailure(`blocked ${u.protocol} URL (only http/https is fetched)`, { code: 'blocked_url', retryable: false })
  }
  if (!allowPrivate && isPrivateHostLiteral(u.hostname)) {
    throw new FetchFailure(`blocked private/loopback target ${u.hostname}`, { code: 'blocked_url', retryable: false })
  }
}

/**
 * Keeps remote-supplied URL strings (Zotero items, provider metadata fields)
 * from ever reaching the browser or the fetcher with a dangerous scheme.
 * Returns '' when the value is not a plain http(s) URL.
 */
export function sanitizeHttpUrl(value) {
  const raw = String(value ?? '').trim()
  if (!/^https?:\/\//i.test(raw)) return ''
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

/**
 * GET with a hard timeout. Every outbound call in this plugin goes through here
 * so that a hung publisher host can never wedge the shared DSH process.
 *
 * Redirects are followed MANUALLY so every hop is re-validated by
 * assertFetchableUrl — a public URL that 302s at 127.0.0.1 or an internal
 * range is refused instead of followed.
 */
export async function httpGet(url, { timeoutMs = 30000, headers = {}, accept, signal, allowPrivate = false } = {}) {
  const onAbort = () => controller.abort()
  let controller
  let current = String(url)
  try {
    for (let hop = 0; ; hop += 1) {
      assertFetchableUrl(current, { allowPrivate })
      controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
      let res
      try {
        res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': UA, ...(accept ? { accept } : {}), ...headers },
        })
      } finally {
        clearTimeout(timer)
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        res.body?.cancel().catch(() => {})
        if (!location) throw new FetchFailure(`GET ${current} -> HTTP ${res.status} without Location`, { code: 'network', status: res.status })
        if (hop >= MAX_REDIRECTS) {
          throw new FetchFailure(`GET ${url} exceeded ${MAX_REDIRECTS} redirects`, { code: 'network', retryable: false })
        }
        current = new URL(location, current).href
        continue
      }
      if (!res.ok) {
        throw new FetchFailure(`GET ${current} -> HTTP ${res.status}`, {
          code: res.status === 404 ? 'not_found' : res.status === 403 || res.status === 401 ? 'forbidden' : 'network',
          status: res.status,
          retryable: res.status === 429 || res.status >= 500,
        })
      }
      return res
    }
  } catch (e) {
    if (e instanceof FetchFailure) throw e
    if (e?.name === 'AbortError') {
      throw new FetchFailure(`GET ${url} timed out after ${timeoutMs}ms`, { code: 'timeout', retryable: true, cause: e })
    }
    throw new FetchFailure(`GET ${url} failed: ${e?.message ?? e}`, { code: 'network', retryable: true, cause: e })
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/** Reads a response body with a hard byte budget; releases the body on error. */
async function readCappedBody(res, maxBytes, url) {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.body?.cancel().catch(() => {})
    throw new FetchFailure(`GET ${url} body too large (${declared} > ${maxBytes} bytes)`, { code: 'too_large', retryable: false })
  }
  if (!res.body) return Buffer.from(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('body budget exceeded')
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  } catch (e) {
    res.body?.cancel().catch(() => {})
    if (e?.message === 'body budget exceeded') {
      throw new FetchFailure(`GET ${url} body exceeded ${maxBytes} bytes`, { code: 'too_large', retryable: false, cause: e })
    }
    throw e
  }
}

export async function httpGetJson(url, options = {}) {
  const res = await httpGet(url, { accept: 'application/json', ...options })
  try {
    const raw = await readCappedBody(res, options.maxBytes ?? MAX_BODY_BYTES.json, url)
    return JSON.parse(raw.toString('utf8'))
  } catch (e) {
    if (e instanceof FetchFailure) throw e
    throw new FetchFailure(`GET ${url} returned non-JSON body`, { code: 'bad_payload', retryable: false, cause: e })
  }
}

export async function httpGetText(url, options = {}) {
  const res = await httpGet(url, options)
  const raw = await readCappedBody(res, options.maxBytes ?? MAX_BODY_BYTES.text, url)
  return raw.toString('utf8')
}

export async function httpGetBuffer(url, options = {}) {
  const res = await httpGet(url, options)
  const buffer = await readCappedBody(res, options.maxBytes ?? MAX_BODY_BYTES.buffer, url)
  return { buffer, contentType: res.headers.get('content-type') ?? '', finalUrl: res.url || url }
}

/** Exponential backoff with jitter, for the categories of failure that are worth retrying. */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 800, maxDelayMs = 8000, label = 'operation', shouldRetry } = {}) {
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt)
    } catch (e) {
      lastError = e
      const retryable = shouldRetry ? shouldRetry(e) : e?.retryable !== false
      if (!retryable || attempt >= maxAttempts) break
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      const jitter = Math.round(delay * 0.2 * Math.random())
      warn(`${label} attempt ${attempt}/${maxAttempts} failed (${e.message}); retrying in ${delay + jitter}ms`)
      await new Promise((r) => setTimeout(r, delay + jitter))
    }
  }
  throw lastError
}
