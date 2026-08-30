import { randomUUID } from 'node:crypto'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { loadConfig, PDF_DIR } from './config.js'
import * as store from './store/db.js'
import { extractIdentifiers } from './extract/identifiers.js'
import { buildItem, sameWork, normalizeDoi, arxivBase } from './extract/dedupe.js'
import { resolveIdentifier } from './metadata/index.js'
import { toZoteroItem } from './metadata/normalize.js'
import { fetchPdf, PdfFailure } from './fetch/pdf.js'
import { saveToZotero } from './zotero/connector.js'
import { exportToDirectory } from './exporter.js'
import { findDuplicates } from './zotero/local-api.js'
import { ping } from './zotero/health.js'
import { pdfFileName } from './zotero/naming.js'
import { withRetry } from './net.js'
import * as sse from './sse.js'
import { log, warn } from './log.js'

/**
 * Orchestrates the life of one entry:
 *
 *   discovered → resolving → resolved → fetching → fetched → saving → saved
 *
 * with explicit failure states at each hop. Every transition is written to the
 * shadow store and pushed over SSE so the panel never has to poll.
 */

const FAILURE_MESSAGES = {
  no_source: '没有找到开放获取的全文来源',
  paywalled: '该文献没有开放获取全文（可能是付费墙）',
  needs_login: '该文献需要登录或机构权限：请先登录后在浏览器下载 PDF，再点「导入本地 PDF」',
  not_found: '标识符在元数据服务中查不到',
  timeout: '请求超时',
  network: '网络请求失败',
  zotero_not_running: '文献库未运行',
  zotero_error: '文献库返回错误',
  no_dir: '未配置导出目录',
  no_metadata: '无法解析出元数据',
}

function failure(code, message, extra = {}) {
  return {
    code,
    message: message || FAILURE_MESSAGES[code] || '操作失败',
    // Only transient conditions are worth a retry button.
    retryable: !['paywalled', 'needs_login', 'no_source', 'not_found', 'no_dir', 'no_metadata'].includes(code),
    ...extra,
  }
}

function pdfPathFor(key) {
  return join(PDF_DIR, `${key.replace(/[^\w.-]+/g, '_')}.pdf`)
}

async function update(key, patch) {
  const next = await store.patchItem(key, patch)
  if (next) sse.emitItem(next)
  return next
}

export async function startTask(key, kind) {
  const task = await store.putTask({
    id: randomUUID(),
    key,
    kind,
    state: 'running',
    progress: 0,
    message: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  sse.emitTask(task)
  return task
}

async function finishTask(task, state, message) {
  const next = await store.putTask({ id: task.id, state, progress: 100, message })
  sse.emitTask(next)
  return next
}

/** Text → deduped side-panel entries. Does not contact the network. */
export async function scanText(text) {
  const found = extractIdentifiers(text)
  const existing = await store.listItems()
  const created = []

  for (const hit of found) {
    const provisional = buildItem({
      doi: hit.kind === 'doi' ? hit.value : '',
      arxiv: hit.kind === 'arxiv' ? hit.value : '',
      isbn: hit.kind === 'isbn' ? hit.value : '',
      pmid: hit.kind === 'pmid' ? hit.value : '',
      title: hit.kind === 'title' ? hit.value : '',
    })
    if (!provisional.key) continue

    const clash = existing.find((e) => sameWork(e, provisional)) ?? (await store.getItem(provisional.key))
    if (clash) continue

    const item = await store.putItem({
      ...provisional,
      kind: hit.kind,
      rawValue: hit.value,
      display: hit.display || hit.value,
      confidence: hit.confidence,
      state: 'discovered',
      createdAt: Date.now(),
    })
    existing.push(item)
    created.push(item)
    sse.emitItem(item)
  }

  return created
}

export async function resolveItem(key) {
  const item = await store.getItem(key)
  if (!item) throw failure('not_found', '条目不存在')
  if (item.record && item.state !== 'resolve_failed') return item

  const task = await startTask(key, 'resolve')
  await update(key, { state: 'resolving', error: null })

  const config = await loadConfig()
  try {
    const record = await withRetry(
      () =>
        resolveIdentifier(
          { kind: item.kind, value: item.rawValue || item.doi || item.arxiv || item.isbn || item.pmid || item.title },
          { timeoutMs: 20000, unpaywallEmail: config.unpaywallEmail },
        ),
      { ...config.retry, label: `resolve ${key}` },
    )

    if (!record) {
      await update(key, { state: 'resolve_failed', error: failure('no_metadata') })
      await finishTask(task, 'failed', '元数据解析失败')
      return store.getItem(key)
    }

    const merged = buildItem({ ...item, ...record })
    // Metadata can rename/formalise the title; keep the stable identity key.
    const updated = await store.patchItem(key, {
      ...merged,
      key,
      state: 'resolved',
      record,
      error: null,
      updatedAt: Date.now(),
    })
    sse.emitItem(updated)
    await finishTask(task, 'done', '元数据解析完成')
    return updated
  } catch (e) {
    const err = failure(e.code ?? 'network', e.message)
    await update(key, { state: 'resolve_failed', error: err })
    await finishTask(task, 'failed', err.message)
    return store.getItem(key)
  }
}

export async function fetchItemPdf(key) {
  const item = await store.getItem(key)
  if (!item) throw failure('not_found', '条目不存在')
  if (item.pdf?.path) return item

  if (!item.record) {
    const resolved = await resolveItem(key)
    if (!resolved?.record) throw failure('no_metadata')
  }
  const current = await store.getItem(key)

  const task = await startTask(key, 'fetch')
  await update(key, { state: 'fetching', error: null })

  const config = await loadConfig()
  try {
    const result = await withRetry(
      (attempt) => {
        if (attempt > 1) sse.emitTask({ id: task.id, state: 'running', progress: 10, message: `第 ${attempt} 次尝试` , updatedAt: Date.now()})
        return fetchPdf(current.record, { timeoutMs: config.fetchTimeoutMs, unpaywallEmail: config.unpaywallEmail, customSources: config.customSources })
      },
      { ...config.retry, label: `fetch ${key}` },
    )

    const path = pdfPathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, result.buffer)
    const updated = await store.patchItem(key, {
      state: 'fetched',
      pdf: { path, size: result.buffer.length, source: result.source, url: result.url },
      error: null,
      updatedAt: Date.now(),
    })
    sse.emitItem(updated)
    await finishTask(task, 'done', `全文下载完成（${(result.buffer.length / 1024).toFixed(0)} KB）`)
    return updated
  } catch (e) {
    const err = failure(e.code ?? 'network', e.message, { detail: e.detail })
    await update(key, { state: 'fetch_failed', error: err })
    await finishTask(task, 'failed', err.message)
    return store.getItem(key)
  }
}

/**
 * Reads an existing library entry so the panel can show a field-level diff
 * instead of silently creating a duplicate.
 */
export async function previewConflict(key) {
  const item = await store.getItem(key)
  if (!item) return null
  const record = item.record
  if (!record) return null

  const status = await ping()
  if (!status.running) return null

  const hits = await findDuplicates({ doi: record.doi, arxiv: record.arxiv, title: record.title })
  if (!hits.length) return null

  const existing = hits[0]
  const incoming = toZoteroItem(record, { clientId: 'preview' })

  const fields = ['title', 'DOI', 'publicationTitle', 'volume', 'issue', 'pages', 'date', 'publisher', 'abstractNote']
  const diff = []
  for (const f of fields) {
    const before = String(existing[f] ?? '')
    const after = String(incoming[f] ?? '')
    if (before === after) continue
    diff.push({ field: f, before, after })
  }

  const beforeAuthors = (existing.creators ?? []).map((c) => `${c.lastName ?? ''}, ${c.firstName ?? ''}`.trim()).join('; ')
  const afterAuthors = (incoming.creators ?? []).map((c) => `${c.lastName ?? ''}, ${c.firstName ?? ''}`.trim()).join('; ')
  if (beforeAuthors !== afterAuthors) diff.push({ field: 'creators', before: beforeAuthors, after: afterAuthors })

  return { key: existing.key, existing, incoming, diff, candidates: hits }
}

export async function saveItem(key, { mode, tags } = {}) {
  const item = await store.getItem(key)
  if (!item) throw failure('not_found', '条目不存在')

  if (!item.record) {
    const resolved = await resolveItem(key)
    if (!resolved?.record) throw failure('no_metadata')
  }
  const current = await store.getItem(key)

  const task = await startTask(key, 'save')
  await update(key, { state: 'saving', error: null })

  const config = await loadConfig()
  const wantMode = mode || config.saveMode

  try {
    let result
    if (wantMode === 'builtin') {
      // The built-in library: the entry and its PDF already live in the
      // plugin's own shadow store, so "saving" means confirming the item into
      // the library. No external app, no network — works offline.
      const updated = await store.patchItem(key, {
        state: 'saved',
        saveMode: 'builtin',
        savedAt: Date.now(),
        error: null,
        updatedAt: Date.now(),
      })
      sse.emitItem(updated)
      await finishTask(task, 'done', current.pdf?.path ? '已保存到内置文献库' : '已保存到内置文献库（无全文）')
      return updated
    }

    if (wantMode === 'dir') {
      let buffer = null
      if (current.pdf?.path) {
        const { readFile } = await import('node:fs/promises')
        buffer = await readFile(current.pdf.path).catch(() => null)
      }
      result = await exportToDirectory(current.record, buffer)
      const updated = await store.patchItem(key, { state: 'saved', saveMode: 'dir', export: result, error: null, updatedAt: Date.now() })
      sse.emitItem(updated)
      await finishTask(task, 'done', '已导出到目录')
      return updated
    }

    // Zotero channel: PDF first, so a missing full text fails before we have
    // already created a parent item with nothing attached.
    let pdfBuffer = null
    if (current.pdf?.path) {
      const { readFile } = await import('node:fs/promises')
      pdfBuffer = await readFile(current.pdf.path).catch(() => null)
    }
    if (!pdfBuffer) {
      const fetched = await fetchItemPdf(key)
      if (fetched?.pdf?.path) {
        const { readFile } = await import('node:fs/promises')
        pdfBuffer = await readFile(fetched.pdf.path).catch(() => null)
      }
    }

    const clientId = `dshz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const zoteroItem = toZoteroItem(current.record, {
      clientId,
      tags: tags?.length ? tags : config.preferredTags,
    })

    const saved = await saveToZotero({
      item: zoteroItem,
      pdfBuffer,
      pdfFileName: pdfFileName(current.record, config.naming),
      pdfUrl: current.pdf?.url || current.record.url || '',
    })

    // The connector doesn't hand back the new key; find it by identifier.
    let zoteroKey = null
    try {
      const hits = await findDuplicates({ doi: current.record.doi, arxiv: current.record.arxiv, title: current.record.title })
      zoteroKey = hits[0]?.key ?? null
    } catch (e) {
      warn('post-save lookup failed:', e.message)
    }

    const updated = await store.patchItem(key, {
      state: 'saved',
      saveMode: 'zotero',
      zotero: { key: zoteroKey, sessionID: saved.sessionID, attachmentSaved: saved.attachmentSaved },
      error: null,
      updatedAt: Date.now(),
    })
    sse.emitItem(updated)
    await finishTask(task, 'done', '已保存到 Zotero')
    return updated
  } catch (e) {
    const err = failure(e.code ?? 'network', e.message, { detail: e.detail })
    await update(key, { state: 'save_failed', error: err })
    await finishTask(task, 'failed', err.message)
    return store.getItem(key)
  }
}

export async function discardItem(key) {
  const item = await store.getItem(key)
  if (item?.pdf?.path) {
    await unlink(item.pdf.path).catch(() => {})
  }
  await store.removeItem(key)
  sse.emit('removed', { key })
}

/** Re-runs whichever stage failed, clearing the error first. */
export async function retryItem(key) {
  const item = await store.getItem(key)
  if (!item) return null
  if (item.state === 'resolve_failed') return resolveItem(key)
  if (item.state === 'fetch_failed') return fetchItemPdf(key)
  if (item.state === 'save_failed') return saveItem(key)
  return item
}

/**
 * Local import for paywalled/needs-login papers: the user signs in on the
 * publisher's site in their own browser, downloads the PDF, then hands it to
 * the panel. The host writes the bytes into the shadow store and, when asked,
 * immediately runs the normal save pipeline (Zotero or directory).
 */
export async function importPdf(key, buffer, { filename = 'imported.pdf', autoSave = true } = {}) {
  const item = await store.getItem(key)
  if (!item) throw failure('not_found', '条目不存在')
  if (!buffer || buffer.length < 8) throw failure('network', '文件内容为空或不是有效 PDF')

  // %PDF magic check, same rule the downloader enforces.
  const magic = buffer.subarray(0, 5)
  if (!magic.equals(Buffer.from('%PDF-', 'latin1'))) {
    throw failure('network', '所选文件不是有效的 PDF')
  }

  const path = pdfPathFor(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)

  const updated = await update(key, {
    state: 'fetched',
    pdf: { path, size: buffer.length, source: 'local-import', url: '', filename },
    error: null,
  })

  let saved = updated
  if (autoSave) {
    saved = await saveItem(key)
  }
  return saved
}

export { normalizeDoi, arxivBase, log }
