import { loadConfig } from '../config.js'
import { resolveDataDir, invalidateDataDir } from './data-dir.js'
import { httpGet } from '../net.js'

const CONNECTOR_API_VERSION = '3'

export function baseUrl(portOverride) {
  return `http://127.0.0.1:${portOverride ?? 23119}`
}

export function connectorHeaders(extra = {}) {
  return { 'X-Zotero-Connector-API-Version': CONNECTOR_API_VERSION, 'Content-Type': 'application/json', ...extra }
}

/**
 * Cheap liveness probe. `/connector/ping` answers GET with a tiny HTML page and
 * needs no session, which makes it ideal for polling.
 */
export async function ping({ port, timeoutMs = 1500 } = {}) {
  const config = await loadConfig()
  const url = `${baseUrl(port ?? config.zoteroPort)}/connector/ping`
  try {
    const res = await httpGet(url, { timeoutMs })
    const version = res.headers.get('x-zotero-version') ?? ''
    await res.text().catch(() => '')
    return { running: true, version, url: baseUrl(port ?? config.zoteroPort) }
  } catch (e) {
    return { running: false, version: '', url: baseUrl(port ?? config.zoteroPort), error: e.message, code: e.code ?? 'network' }
  }
}

/**
 * Everything the side panel needs on first paint: is Zotero up, where is the
 * library, and can we write to it.
 */
export async function describe() {
  const config = await loadConfig()
  const status = await ping()
  const { dataDir, profileDir, source } = await resolveDataDir()

  let library = null
  if (status.running) {
    try {
      const res = await httpGet(`${baseUrl(config.zoteroPort)}/api/users/0/items/top?limit=1&format=json`, {
        timeoutMs: 3000,
        headers: { 'Zotero-API-Version': '3' },
      })
      const total = res.headers.get('total-results')
      await res.text().catch(() => '')
      library = { readable: true, itemCount: total ? Number(total) : null }
    } catch (e) {
      library = { readable: false, error: e.message }
    }
  }

  return {
    running: status.running,
    version: status.version,
    endpoint: status.url,
    dataDir: config.dataDirOverride || dataDir || '',
    dataDirSource: config.dataDirOverride ? 'override' : source,
    profileDir,
    library,
    saveMode: config.saveMode,
  }
}

export function refresh() {
  invalidateDataDir()
}

export async function ensureZotero() {
  const status = await ping()
  if (!status.running) {
    throw Object.assign(new Error('Zotero 未运行'), { code: 'zotero_not_running' })
  }
  return status
}
