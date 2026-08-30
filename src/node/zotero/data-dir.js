import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir, platform } from 'node:os'
import { warn } from '../log.js'

/**
 * Zotero's data directory is a user preference, not a fixed location — this
 * machine keeps it on `D:\Documents` rather than the `~/Zotero` default. The
 * only reliable way to find it is to read the running profile's `prefs.js`.
 */

function appDataRoot() {
  if (process.env.APPDATA) return process.env.APPDATA
  if (platform() === 'win32') return join(homedir(), 'AppData', 'Roaming')
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support')
  return join(homedir(), '.config')
}

function zoteroProfileRoot() {
  return join(appDataRoot(), 'Zotero', 'Zotero')
}

/** Windows prefs escape backslashes; JSON-ish unescape is enough here. */
function unescapePath(value) {
  return String(value).replace(/\\\\/g, '\\')
}

async function parseProfilesIni(root) {
  try {
    const ini = await readFile(join(root, 'profiles.ini'), 'utf8')
    const profiles = []
    let current = null
    for (const rawLine of ini.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.startsWith('[')) {
        current = {}
        profiles.push(current)
        continue
      }
      const eq = line.indexOf('=')
      if (eq === -1 || !current) continue
      current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    return profiles
      .filter((p) => p.Path && p.Name)
      .sort((a, b) => (Number(b.Default) || 0) - (Number(a.Default) || 0))
  } catch {
    return []
  }
}

async function candidateProfileDirs() {
  const root = zoteroProfileRoot()
  const dirs = []
  for (const p of await parseProfilesIni(root)) {
    dirs.push(resolve(root, p.Path.replace(/\//g, '\\')))
  }
  // Fall back to scanning for profile folders if profiles.ini is missing.
  try {
    const profilesDir = join(root, 'Profiles')
    for (const name of await readdir(profilesDir)) {
      dirs.push(join(profilesDir, name))
    }
  } catch {
    /* profile dir absent */
  }
  return dirs
}

async function readDataDirFrom(dir) {
  let text
  try {
    text = await readFile(join(dir, 'prefs.js'), 'utf8')
  } catch {
    return null
  }
  const m = /user_pref\(\s*["']extensions\.zotero\.dataDir["']\s*,\s*["']([^"']+)["']\s*\)/.exec(text)
  return m ? unescapePath(m[1]) : null
}

async function isValidDataDir(dir) {
  if (!dir) return false
  try {
    const s = await stat(join(dir, 'zotero.sqlite'))
    return s.isFile()
  } catch {
    return false
  }
}

let cached = null

/**
 * @returns {Promise<{dataDir: string|null, profileDir: string|null, source: string}>}
 */
export async function resolveDataDir() {
  if (cached) return cached
  const result = { dataDir: null, profileDir: null, source: 'none' }

  for (const dir of await candidateProfileDirs()) {
    const dataDir = await readDataDirFrom(dir)
    if (dataDir && (await isValidDataDir(dataDir))) {
      result.dataDir = dataDir
      result.profileDir = dir
      result.source = 'prefs'
      break
    }
    if (dataDir && !result.dataDir) {
      result.dataDir = dataDir
      result.profileDir = dir
      result.source = 'prefs-unverified'
    }
  }

  if (!result.dataDir) {
    const fallback = join(homedir(), 'Zotero')
    if (await isValidDataDir(fallback)) {
      result.dataDir = fallback
      result.source = 'default'
    }
  }

  if (result.source === 'prefs-unverified') warn(`dataDir ${result.dataDir} has no zotero.sqlite`)
  cached = result
  return result
}

export function invalidateDataDir() {
  cached = null
}
