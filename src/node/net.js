import { warn } from './log.js'

const UA = 'dsh-literature/0.3.3 (+https://github.com/deepseek-ai/deepseek-harness)'

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
 * GET with a hard timeout. Every outbound call in this plugin goes through here
 * so that a hung publisher host can never wedge the shared DSH process.
 */
export async function httpGet(url, { timeoutMs = 30000, headers = {}, accept, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, ...(accept ? { accept } : {}), ...headers },
    })
    if (!res.ok) {
      throw new FetchFailure(`GET ${url} -> HTTP ${res.status}`, {
        code: res.status === 404 ? 'not_found' : res.status === 403 || res.status === 401 ? 'forbidden' : 'network',
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      })
    }
    return res
  } catch (e) {
    if (e instanceof FetchFailure) throw e
    if (e?.name === 'AbortError') {
      throw new FetchFailure(`GET ${url} timed out after ${timeoutMs}ms`, { code: 'timeout', retryable: true, cause: e })
    }
    throw new FetchFailure(`GET ${url} failed: ${e?.message ?? e}`, { code: 'network', retryable: true, cause: e })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

export async function httpGetJson(url, options = {}) {
  const res = await httpGet(url, { accept: 'application/json', ...options })
  try {
    return await res.json()
  } catch (e) {
    throw new FetchFailure(`GET ${url} returned non-JSON body`, { code: 'bad_payload', retryable: false, cause: e })
  }
}

export async function httpGetText(url, options = {}) {
  const res = await httpGet(url, options)
  return res.text()
}

export async function httpGetBuffer(url, options = {}) {
  const res = await httpGet(url, options)
  const buf = Buffer.from(await res.arrayBuffer())
  return { buffer: buf, contentType: res.headers.get('content-type') ?? '', finalUrl: res.url || url }
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
