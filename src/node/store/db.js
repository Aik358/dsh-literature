import { STORE_PATH, writeJsonAtomic, readJsonOrNull } from '../config.js'
import { log, warn } from '../log.js'

/**
 * The plugin's own shadow store. Deliberately kept apart from Zotero's library:
 * Zotero's schema is an internal implementation detail that changes between
 * releases, and writing to it while the client is running would fight the
 * in-memory cache. Everything the side panel needs to remember — pending items,
 * download tasks, highlights, notes — lives here instead.
 */

const EMPTY = { version: 1, items: {}, tasks: {}, annotations: {}, importedFiles: {} }

let state = null
let flushTimer = null
let flushing = null

async function load() {
  if (state) return state
  const raw = await readJsonOrNull(STORE_PATH)
  state = raw && raw.version === 1 ? { ...EMPTY, ...raw } : { ...EMPTY }
  return state
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushing = persist().catch((e) => warn('persist failed:', e.message))
  }, 250)
  flushTimer.unref?.()
}

async function persist() {
  const snapshot = state ?? (await load())
  await writeJsonAtomic(STORE_PATH, snapshot)
}

export async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  await persist()
  if (flushing) {
    await flushing
    flushing = null
  }
}

export async function getState() {
  return load()
}

export async function getItem(key) {
  return (await load()).items[key] ?? null
}

export async function listItems() {
  const s = await load()
  return Object.values(s.items).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export async function putItem(item) {
  const s = await load()
  const prev = s.items[item.key]
  const next = { ...prev, ...item, updatedAt: Date.now() }
  next.createdAt = prev?.createdAt ?? item.createdAt ?? Date.now()
  s.items[item.key] = next
  scheduleFlush()
  return next
}

export async function patchItem(key, patch) {
  const s = await load()
  const prev = s.items[key]
  if (!prev) return null
  const next = { ...prev, ...patch, updatedAt: Date.now() }
  s.items[key] = next
  scheduleFlush()
  return next
}

export async function removeItem(key) {
  const s = await load()
  delete s.items[key]
  delete s.annotations[key]
  scheduleFlush()
}

export async function putTask(task) {
  const s = await load()
  s.tasks[task.id] = { ...s.tasks[task.id], ...task, updatedAt: Date.now() }
  scheduleFlush()
  return s.tasks[task.id]
}

export async function getTask(id) {
  return (await load()).tasks[id] ?? null
}

export async function listTasks() {
  return Object.values((await load()).tasks).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export async function removeTask(id) {
  const s = await load()
  delete s.tasks[id]
  scheduleFlush()
}

export async function getAnnotations(key) {
  return (await load()).annotations[key] ?? []
}

export async function addAnnotation(key, annotation) {
  const s = await load()
  const list = s.annotations[key] ?? []
  const next = { id: annotation.id ?? `an_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), ...annotation }
  list.push(next)
  s.annotations[key] = list
  scheduleFlush()
  return next
}

export async function patchAnnotation(key, id, patch) {
  const s = await load()
  const list = s.annotations[key] ?? []
  const idx = list.findIndex((a) => a.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() }
  scheduleFlush()
  return list[idx]
}

export async function removeAnnotation(key, id) {
  const s = await load()
  s.annotations[key] = (s.annotations[key] ?? []).filter((a) => a.id !== id)
  scheduleFlush()
}

/** Tracks watched-folder files so a re-scan only picks up new ones. */
export async function getImportedFile(absPath) {
  return (await load()).importedFiles[absPath] ?? null
}

export async function addImportedFile(absPath, mtimeMs) {
  const s = await load()
  s.importedFiles[absPath] = { mtimeMs: Number(mtimeMs), importedAt: Date.now() }
  // Keep the tracking map bounded (LRU-ish: drop oldest entries beyond 500).
  const keys = Object.keys(s.importedFiles)
  if (keys.length > 500) {
    const drop = keys.slice(0, keys.length - 500)
    for (const k of drop) delete s.importedFiles[k]
  }
  scheduleFlush()
}

export async function removeImportedFile(absPath) {
  const s = await load()
  delete s.importedFiles[absPath]
  scheduleFlush()
}

/** Drops transient task rows that no longer describe live work. */
export async function pruneFinishedTasks(olderThanMs = 24 * 3600 * 1000) {
  const s = await load()
  const cutoff = Date.now() - olderThanMs
  let removed = 0
  for (const [id, t] of Object.entries(s.tasks)) {
    if (t.state === 'done' || t.state === 'failed' || t.state === 'cancelled') {
      if ((t.updatedAt ?? 0) < cutoff) {
        delete s.tasks[id]
        removed += 1
      }
    }
  }
  if (removed) scheduleFlush()
  return removed
}

export async function init() {
  await load()
  await pruneFinishedTasks()
  log('shadow store loaded')
}
