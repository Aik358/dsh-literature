import { writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadConfig } from './config.js'
import { pdfFileName } from './zotero/naming.js'

/**
 * Fallback save channel: drop the PDF plus a metadata sidecar into a plain
 * directory. Used when Zotero isn't running, or when the user simply wants the
 * files somewhere they control. The sidecars are what make the folder
 * re-importable — CSL-JSON for Zotero, RIS for everything else.
 */

function cslJson(record) {
  const authors = (record.authors ?? []).map((a) => ({
    family: a.lastName ?? '',
    given: a.firstName ?? '',
  }))
  const type = {
    journalArticle: 'article-journal',
    book: 'book',
    bookSection: 'chapter',
    conferencePaper: 'paper-conference',
    preprint: 'manuscript',
    thesis: 'thesis',
    report: 'report',
    dataset: 'dataset',
  }[record.itemType] ?? 'article-journal'

  return [
    {
      id: record.doi || record.arxiv || record.title || 'item',
      type,
      title: record.title ?? '',
      author: authors,
      issued: record.year ? { 'date-parts': [[record.year]] } : undefined,
      'container-title': record.container || undefined,
      publisher: record.publisher || undefined,
      volume: record.volume || undefined,
      issue: record.issue || undefined,
      page: record.pages || undefined,
      DOI: record.doi || undefined,
      ISBN: record.isbn || undefined,
      ISSN: record.issn || undefined,
      abstract: record.abstract || undefined,
      URL: record.url || undefined,
      note: record.arxiv ? `arXiv:${record.arxiv}` : undefined,
    },
  ]
}

function risLine(tag, value) {
  return value ? `${tag}  - ${String(value).replace(/[\r\n]+/g, ' ')}` : null
}

function ris(record) {
  const typeMap = {
    journalArticle: 'JOUR',
    book: 'BOOK',
    bookSection: 'CHAP',
    conferencePaper: 'CONF',
    preprint: 'EJOUR',
    thesis: 'THES',
    report: 'RPRT',
    dataset: 'DATA',
  }
  const lines = [risLine('TY', typeMap[record.itemType] ?? 'JOUR')]
  for (const a of record.authors ?? []) {
    lines.push(risLine('AU', [a.lastName, a.firstName].filter(Boolean).join(', ')))
  }
  lines.push(
    risLine('TI', record.title),
    risLine('JO', record.container),
    risLine('PB', record.publisher),
    risLine('VL', record.volume),
    risLine('IS', record.issue),
    risLine('SP', record.pages),
    risLine('PY', record.year ? String(record.year) : ''),
    risLine('AB', record.abstract),
    risLine('DO', record.doi),
    risLine('SN', record.isbn || record.issn),
    risLine('UR', record.url),
    risLine('ER', ''),
  )
  return lines.filter(Boolean).join('\r\n') + '\r\n'
}

/**
 * @returns {Promise<{dir: string, pdfPath: string, jsonPath: string, risPath: string}>}
 */
export async function exportToDirectory(record, pdfBuffer) {
  const config = await loadConfig()
  const dir = resolve(config.dirPath || '')
  if (!dir) throw Object.assign(new Error('未配置导出目录'), { code: 'no_dir' })

  await mkdir(dir, { recursive: true })

  const base = pdfFileName(record, config.naming)
  const stem = base.replace(/\.pdf$/i, '')
  const pdfPath = join(dir, base)
  const formats = new Set(config.exportFormats?.length ? config.exportFormats : ['csl-json', 'ris'])
  const wantCsl = formats.has('csl-json')
  const wantRis = formats.has('ris')

  const jsonPath = wantCsl ? join(dir, `${stem}.csl.json`) : null
  const risPath = wantRis ? join(dir, `${stem}.ris`) : null

  // `stem` may contain separators from a badly authored template.
  const safePaths = [pdfPath, jsonPath, risPath].filter(Boolean).map((p) => resolve(dir, p.replace(/^.*[\\/]/, '')))

  if (pdfBuffer?.length) await writeFile(safePaths[0], pdfBuffer)
  let i = 1
  if (wantCsl) await writeFile(safePaths[i++], JSON.stringify(cslJson(record), null, 2), 'utf8')
  if (wantRis) await writeFile(safePaths[i++], ris(record), 'utf8')

  return { dir, pdfPath: safePaths[0], jsonPath: jsonPath ? safePaths[wantCsl ? 1 : 0] : null, risPath: risPath ? safePaths[safePaths.length - 1] : null }
}
