import { once } from 'node:events'

const DEFAULT_LIMIT = 64 * 1024 * 1024 // 64 MB — enough for large journal PDFs

/**
 * Every route in this plugin is loopback-only. The DSH web server may also be
 * bound to a LAN address, and nothing here should be reachable from anywhere
 * but the machine itself.
 *
 * `remoteAddress` alone is not enough for a browser threat model: any web page
 * can aim requests at 127.0.0.1, and a DNS-rebound origin defeats CORS
 * entirely. Two extra checks close those paths:
 *   - the Host header must name a loopback host (blocks DNS rebinding);
 *   - a state-changing request that carries an Origin header must carry a
 *     loopback Origin (blocks cross-site form/fetch calls from web pages).
 */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1'])

function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '').trim().toLowerCase()
  if (!h) return ''
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    return end === -1 ? '' : h.slice(1, end)
  }
  return h.split(':')[0]
}

function originHostname(originHeader) {
  try {
    return new URL(String(originHeader ?? '').trim()).hostname.toLowerCase()
  } catch {
    return null // absent or malformed: null means "not present", '' means "present but empty"
  }
}

export function isLoopbackRequest(req) {
  const remote = req.socket?.remoteAddress ?? ''
  const fromLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
  if (!fromLoopback) return false
  if (!LOOPBACK_HOSTNAMES.has(hostnameOf(req.headers?.host))) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers?.origin
    if (origin !== undefined) {
      const host = originHostname(origin)
      if (host === null || host === '' || !LOOPBACK_HOSTNAMES.has(host)) return false
    }
  }
  return true
}

export function writeJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function writeText(res, status, text) {
  const payload = Buffer.from(text, 'utf8')
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      req.destroy()
      throw new Error(`request body too large (limit ${limit} bytes)`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function readRawBody(req, limit = DEFAULT_LIMIT) {
  if (req.method === 'GET' || req.method === 'HEAD') return Buffer.alloc(0)
  return readBody(req, limit)
}

export async function readJsonBody(req, limit = 8 * 1024 * 1024) {
  const raw = await readRawBody(req, limit)
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error('request body is not valid JSON')
  }
}

/** Resolves when `res` is finished or the socket drops, so SSE loops can exit. */
export function responseClosed(res) {
  return once(res, 'close')
}

export function writeSseHead(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  // Tell the browser not to reconnect immediately if the host restarts.
  res.write('retry: 3000\n\n')
}

export function writeSseEvent(res, id, event, data) {
  if (id !== undefined) res.write(`id: ${id}\n`)
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/** Parses `Range: bytes=` into an inclusive [start, end] window. */
export function parseRange(header, total) {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, startRaw, endRaw] = m
  if (startRaw === '' && endRaw === '') return null
  let start
  let end
  if (startRaw === '') {
    // suffix range: last N bytes
    const suffix = Number(endRaw)
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? total - 1 : Math.min(Number(endRaw), total - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return { invalid: true, total }
  }
  return { start, end, total }
}
