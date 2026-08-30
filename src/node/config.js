import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { log } from './log.js'

/**
 * DSH keeps all of its per-user state under `$DSH_HOME`, which defaults to
 * `~/.dsh`. The reference plugin reads the same location, so we follow it.
 */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME || process.env.DSH_CONFIG_DIR
  if (fromEnv) return resolve(fromEnv)
  return resolve(homedir(), '.dsh')
}

export const CONFIG_PATH = join(dshHome(), 'dsh-literature.json')
export const STORE_DIR = join(dshHome(), 'storages', 'dsh-literature')
export const PDF_DIR = join(STORE_DIR, 'pdfs')
export const STORE_PATH = join(STORE_DIR, 'store.json')

const DEFAULTS = {
  version: 1,
  /** 'builtin' keeps everything inside the plugin's own shadow library (no
   *  external app needed); 'zotero' writes through the Zotero-ecosystem
   *  Connector API (requires the app running); 'dir' exports to `dirPath`. */
  saveMode: 'builtin',
  dirPath: '',
  /** Collection names the user wants new items to land in. Advisory only — the
   *  Connector API saves into whatever the Zotero pane currently has selected. */
  preferredCollections: [],
  preferredTags: [],
  /** Filename template for the 'dir' channel. */
  naming: '{author}_{year}_{title}',
  /** Sidecar formats written by the 'dir' channel. */
  exportFormats: ['csl-json', 'ris'],
  /** Fallback: regex-scan model replies for identifiers. Off by default. */
  autoScanSession: false,
  /** Resolve metadata automatically right after an identifier is scanned. */
  autoResolve: true,
  /** Include quoted-title detection when scanning text. */
  includeTitles: true,
  /** Default behaviour when the library already holds a look-alike entry. */
  conflictStrategy: 'ask',
  /** Unpaywall requires a contact email in the query string. */
  unpaywallEmail: '',
  retry: { maxAttempts: 3, baseDelayMs: 800, maxDelayMs: 8000 },
  fetchTimeoutMs: 30000,
  zoteroPort: 23119,
  /** Overrides automatic data-dir detection from the Zotero profile prefs. */
  dataDirOverride: '',
  /** Panel geometry defaults (the client keeps live geometry in localStorage). */
  panelWidth: 380,
  readerFit: 'fit-width',
  /** Entry placement: 'auto' (better-sidebar tab when available, else footer),
   *  'footer' (always the sidebar footer button), 'hide' (settings page only). */
  entryMode: 'auto',
  /** Watched folder: new PDFs here are auto-imported into the built-in library. */
  importDir: '',
  watchImport: false,
}

function merge(base, patch) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) {
      out[k] = merge(base[k], v)
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out
}

let cached = null

export async function loadConfig() {
  if (cached) return cached
  let raw = null
  try {
    raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  } catch {
    raw = null
  }
  cached = merge(DEFAULTS, raw)
  return cached
}

export async function saveConfig(patch) {
  const next = merge(await loadConfig(), patch)
  cached = next
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  const tmp = `${CONFIG_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
  await rename(tmp, CONFIG_PATH)
  return next
}

export function invalidateConfig() {
  cached = null
}

/** Writes JSON through a temp file + rename so a crash can't truncate state. */
export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rename(tmp, path)
}

export async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

export async function ensureDirs() {
  await mkdir(PDF_DIR, { recursive: true })
  log('storage ready at', STORE_DIR)
}
