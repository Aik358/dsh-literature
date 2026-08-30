import { httpGetText } from '../net.js'

const API = 'https://export.arxiv.org/api/query'

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function tag(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : ''
}

function namespacesTag(block, name) {
  const m = new RegExp(`<[a-zA-Z-]+:${name}(?:\\s[^>]*)?>([\\s\\S]*?)</[a-zA-Z-]+:${name}>`, 'i').exec(block)
  return m ? decodeEntities(m[1]).trim() : ''
}

function authors(block) {
  const out = []
  const re = /<author>([\s\S]*?)<\/author>/gi
  let m
  while ((m = re.exec(block)) !== null) {
    const name = tag(m[1], 'name')
    if (!name) continue
    const parts = name.split(/\s+/)
    out.push({
      creatorType: 'author',
      firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts[parts.length - 1],
    })
  }
  return out
}

function pdfUrl(block, entryId) {
  const direct = /<link[^>]*title=["']pdf["'][^>]*href=["']([^"']+)["']/i.exec(block)
  if (direct) return decodeEntities(direct[1])
  const byType = /<link[^>]*type=["']application\/pdf["'][^>]*href=["']([^"']+)["']/i.exec(block)
  if (byType) return decodeEntities(byType[1])
  const clean = String(entryId ?? '').replace(/\/v\d+$/, '')
  return clean ? `${clean.replace('http://', 'https://')}.pdf` : ''
}

export function normalizeEntry(block) {
  const id = tag(block, 'id')
  const versioned = /abs\/(.+?)(?:v\d+)?$/i.exec(id)?.[1] ?? ''
  const title = tag(block, 'title')
  if (!title) return null
  const published = tag(block, 'published')
  const year = published ? Number(published.slice(0, 4)) : null
  const journalRef = namespacesTag(block, 'journal_ref')

  return {
    source: 'arxiv',
    itemType: journalRef ? 'journalArticle' : 'preprint',
    title,
    authors: authors(block),
    year: Number.isFinite(year) ? year : null,
    container: journalRef ? '' : 'arXiv',
    publisher: journalRef ? '' : 'arXiv',
    volume: '',
    issue: '',
    pages: '',
    doi: namespacesTag(block, 'doi') || '',
    isbn: '',
    issn: '',
    url: id,
    abstract: tag(block, 'summary'),
    arxiv: versioned,
    pdfUrl: pdfUrl(block, id),
    raw: { id, published, journalRef },
  }
}

export async function fetchById(id, { timeoutMs } = {}) {
  const clean = String(id).replace(/^arxiv:/i, '').replace(/\.pdf$/i, '')
  const url = `${API}?id_list=${encodeURIComponent(clean)}&max_results=1`
  const xml = await httpGetText(url, { timeoutMs })
  const entry = /<entry>([\s\S]*?)<\/entry>/i.exec(xml)
  if (!entry) return null
  return normalizeEntry(entry[1])
}

export async function searchByTitle(title, { timeoutMs, rows = 3 } = {}) {
  const url = `${API}?search_query=${encodeURIComponent(`all:"${title}"`)}&max_results=${rows}&sortBy=relevance`
  const xml = await httpGetText(url, { timeoutMs })
  const out = []
  const re = /<entry>([\s\S]*?)<\/entry>/gi
  let m
  while ((m = re.exec(xml)) !== null) {
    const e = normalizeEntry(m[1])
    if (e) out.push(e)
  }
  return out
}
