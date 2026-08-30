import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve, extname, basename } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { loadConfig, PDF_DIR } from './config.js'
import * as store from './store/db.js'
import * as sse from './sse.js'
import { buildItem, titleFingerprint } from './extract/dedupe.js'
import { resolveIdentifier } from './metadata/index.js'
import { searchItems, getItemChildren, getFileBuffer } from './zotero/local-api.js'
import { log, warn } from './log.js'

/**
 * Library management: pull existing papers into the plugin's built-in library
 * from a watched folder or from the Zotero-ecosystem app, and keep the
 * watched folder in sync automatically.
 */

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1')

/** Heuristic title from a file name; understands DOI / arXiv-style names. */
export function titleFromFilename(name) {
  let t = String(name).replace(/\.pdf$/i, '')
  const doi = /(10\.\d{4,9}[\/_][^\s]+)/i.exec(t)
  if (doi) return { kind: 'doi', value: doi[1].replace(/_/g, '/') }
  const arxiv = /\b(\d{4}\.\d{4,5})(v\d+)?\b/.exec(t)
  if (arxiv) return { kind: 'arxiv', value: arxiv[1] + (arxiv[2] ?? '') }
  t = t
    .replace(/^\[\d+\]\s*/, '')
    .replace(/\s*\(?\d{4}[a-z]?\)?\s*$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/^\d+[\s.]+/, '')
    .trim()
  if (!t) return null
  return { kind: 'title', value: t }
}

function pathForPdfKey(key) {
  return join(PDF_DIR, `${key.replace(/[^\w.-]+/g, '_')}.pdf`)
}

async function savePdfBuffer(key, buffer) {
  const path = pathForPdfKey(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
  return { path, size: buffer.length, source: 'library-import' }
}

/**
 * Scans a folder for PDFs and adds new ones to the built-in library.
 * Files are tracked by absolute path so re-runs only pick up new files.
 */
export async function importDir(dir, { autoResolve = true } = {}) {
  const target = resolve(dir || '')
  if (!target) throw Object.assign(new Error('未配置导入文件夹'), { code: 'no_dir' })
  let files
  try {
    files = await readdir(target)
  } catch (e) {
    throw Object.assign(new Error(`无法读取文件夹 ${target}`), { code: 'no_dir', cause: e })
  }

  const imported = []
  const skipped = []
  for (const name of files.filter((f) => extname(f).toLowerCase() === '.pdf')) {
    const abs = join(target, name)
    const seen = await store.getImportedFile(abs)
    let st
    try {
      st = await stat(abs)
    } catch {
      continue
    }
    if (seen && seen.mtimeMs === st.mtimeMs) {
      skipped.push({ file: name, reason: 'already-imported' })
      continue
    }

    let item
    try {
      const hit = titleFromFilename(name)
      if (!hit) {
        skipped.push({ file: name, reason: 'unparseable-name' })
        continue
      }
      // Dedupe against the library first.
      const provisional = buildItem({
        doi: hit.kind === 'doi' ? hit.value : '',
        arxiv: hit.kind === 'arxiv' ? hit.value : '',
        title: hit.kind === 'title' ? hit.value : '',
      })
      if (!provisional.key) {
        skipped.push({ file: name, reason: 'no-identity' })
        continue
      }
      const clash = await store.getItem(provisional.key)
      if (clash) {
        await store.addImportedFile(abs, st.mtimeMs)
        skipped.push({ file: name, reason: 'duplicate' })
        continue
      }

      // Copy the PDF into the shadow store so the entry is self-contained
      // (the source folder may be cleaned up later).
      let pdf = null
      try {
        const content = await readFile(abs)
        if (content.subarray(0, 5).equals(PDF_MAGIC)) {
          pdf = await savePdfBuffer(provisional.key, content)
        }
      } catch (e) {
        warn(`copy pdf failed for ${name}:`, e.message)
      }

      item = await store.putItem({
        ...provisional,
        kind: hit.kind,
        rawValue: hit.value,
        display: hit.value,
        title: provisional.title || hit.value,
        state: pdf ? 'fetched' : 'discovered',
        pdf,
        sourceFile: abs,
        createdAt: Date.now(),
      })
      sse.emitItem(item)
    } catch (e) {
      warn(`import ${name} failed:`, e.message)
      skipped.push({ file: name, reason: e.message })
      continue
    }

    // Auto-resolve metadata when asked; a miss leaves a title-only entry.
    if (autoResolve) {
      try {
        const { resolveItem } = await import('./pipeline.js')
        item = await resolveItem(item.key)
      } catch (e) {
        warn(`auto-resolve ${name} failed:`, e.message)
      }
    }
    await store.addImportedFile(abs, st.mtimeMs)
    imported.push(item?.key ?? provisionalKeyOf(item))
  }

  return { imported, skipped, dir: target }
}

function provisionalKeyOf(item) {
  return item?.key ?? ''
}

/** Zotero Local API item `data` → normalised record. */
export function zoteroItemToRecord(it) {
  const d = it?.data ?? it ?? {}
  const year = /^(\d{4})/.exec(String(d.date ?? ''))?.[1]
  return {
    source: 'zotero',
    itemType: d.itemType ?? 'journalArticle',
    title: d.title ?? '',
    authors: (d.creators ?? []).map((c) => ({
      creatorType: c.creatorType ?? 'author',
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
    })),
    year: year ? Number(year) : null,
    container: d.publicationTitle ?? d.bookTitle ?? d.proceedingsTitle ?? '',
    publisher: d.publisher ?? '',
    volume: d.volume ?? '',
    issue: d.issue ?? '',
    pages: d.pages ?? '',
    doi: d.DOI ?? '',
    isbn: d.ISBN ?? '',
    url: d.url ?? '',
    abstract: d.abstractNote ?? '',
  }
}

/**
 * Pulls the top `limit` items from the Zotero-ecosystem library (with their
 * PDF attachments) into the built-in library. Requires the app to be running.
 */
export async function importFromZotero({ limit = 50 } = {}) {
  const items = await searchItems('', { limit })
  const imported = []
  const skipped = []

  for (const it of items) {
    const rec = zoteroItemToRecord(it)
    if (!rec.title) {
      skipped.push({ reason: 'no-title' })
      continue
    }
    const provisional = buildItem(rec)
    if (!provisional.key) {
      skipped.push({ reason: 'no-identity' })
      continue
    }
    const existing = await store.getItem(provisional.key)
    if (existing) {
      skipped.push({ reason: 'duplicate' })
      continue
    }

    let pdf = null
    try {
      const children = await getItemChildren(it.key)
      const attach = (children ?? []).find(
        (c) => c.itemType === 'attachment' && /pdf/i.test(c.contentType ?? c.contentType ?? ''),
      )
      if (attach?.key) {
        const { buffer } = await getFileBuffer(attach.key).catch(() => ({ buffer: null }))
        if (buffer?.length && buffer.subarray(0, 5).equals(PDF_MAGIC)) {
          pdf = await savePdfBuffer(provisional.key, buffer)
        }
      }
    } catch (e) {
      warn(`attachment import failed for ${it.key}:`, e.message)
    }

    const item = await store.putItem({
      ...provisional,
      record: rec,
      state: pdf ? 'fetched' : 'resolved',
      pdf,
      createdAt: Date.now(),
    })
    sse.emitItem(item)
    imported.push(item.key)
  }

  return { imported, skipped, count: imported.length }
}

let watcherTimer = null

/**
 * Periodically scans the configured import folder for new PDFs. Starts
 * immediately with an initial sweep, then on `watchIntervalSec`.
 */
export function startWatcher() {
  if (watcherTimer) return () => stopWatcher()
  let stopping = false

  const sweep = async () => {
    if (stopping) return
    const config = await loadConfig()
    if (!config.watchImport || !config.importDir) return
    try {
      const r = await importDir(config.importDir, { autoResolve: config.autoResolve !== false })
      if (r.imported.length) log(`folder watch imported ${r.imported.length} new file(s)`)
    } catch (e) {
      warn('folder watch sweep failed:', e.message)
    }
  }

  // First sweep shortly after boot; then every 30s (config is re-read each
  // sweep, so watchImport / importDir changes apply without a restart).
  const initial = setTimeout(sweep, 5000)
  initial.unref?.()
  const timer = setInterval(sweep, 30000)
  timer.unref?.()

  watcherTimer = { timer, initial }
  return () => stopWatcher()
}

export function stopWatcher() {
  if (!watcherTimer) return
  clearInterval(watcherTimer.timer)
  clearTimeout(watcherTimer.initial)
  watcherTimer = null
}
