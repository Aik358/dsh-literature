import { httpGetJson } from '../net.js'

const BASE = 'https://api.crossref.org'

function splitName(name) {
  const s = (name ?? '').trim()
  if (!s) return { firstName: '', lastName: '' }
  // "Smith, John" -> last="Smith", first="John"
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim())
    return { firstName: first ?? '', lastName: last ?? '' }
  }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function yearOf(work) {
  const parts = work.issued?.['date-parts']?.[0]
  if (Array.isArray(parts) && Number.isFinite(parts[0])) return parts[0]
  const fromPrint = work['published-print']?.['date-parts']?.[0]
  if (Array.isArray(fromPrint) && Number.isFinite(fromPrint[0])) return fromPrint[0]
  const fromOnline = work['published-online']?.['date-parts']?.[0]
  if (Array.isArray(fromOnline) && Number.isFinite(fromOnline[0])) return fromOnline[0]
  return null
}

/** JATS/HTML-ish markup shows up in some abstracts; strip it flat. */
function cleanText(s) {
  return String(s ?? '')
    .replace(/<jats:[^>]*>|<\/jats:[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const TYPE_MAP = {
  'journal-article': 'journalArticle',
  'proceedings-article': 'conferencePaper',
  book: 'book',
  'book-chapter': 'bookSection',
  'book-part': 'bookSection',
  monograph: 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  report: 'report',
  'report-component': 'report',
  dissertation: 'thesis',
  preprint: 'preprint',
  'posted-content': 'preprint',
  dataset: 'dataset',
  standard: 'standard',
  'journal-issue': 'journalArticle',
  'peer-review': 'journalArticle',
}

export function normalizeWork(work) {
  if (!work) return null
  const authors = (work.author ?? []).map((a) => ({
    creatorType: 'author',
    ...splitName(a.name ?? [a.given, a.family].filter(Boolean).join(' ')),
  }))
  const editors = (work.editor ?? []).map((a) => ({
    creatorType: 'editor',
    ...splitName(a.name ?? [a.given, a.family].filter(Boolean).join(' ')),
  }))

  return {
    source: 'crossref',
    itemType: TYPE_MAP[work.type] ?? 'journalArticle',
    title: Array.isArray(work.title) ? cleanText(work.title[0]) : cleanText(work.title),
    authors: authors.length ? authors : editors,
    year: yearOf(work),
    container: Array.isArray(work['container-title']) ? cleanText(work['container-title'][0]) : cleanText(work['container-title']),
    publisher: cleanText(work.publisher),
    volume: work.volume ?? '',
    issue: work.issue ?? '',
    pages: work.page ?? '',
    doi: work.DOI ?? '',
    isbn: Array.isArray(work.ISBN) ? work.ISBN[0] ?? '' : work.ISBN ?? '',
    issn: Array.isArray(work.ISSN) ? work.ISSN[0] ?? '' : work.ISSN ?? '',
    url: work.URL ?? (work.DOI ? `https://doi.org/${work.DOI}` : ''),
    abstract: cleanText(work.abstract),
    language: work.language ?? '',
    raw: work,
  }
}

export async function fetchByDoi(doi, { mailto, timeoutMs } = {}) {
  const url = `${BASE}/works/${encodeURIComponent(doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`
  const body = await httpGetJson(url, { timeoutMs })
  return normalizeWork(body.message)
}

export async function searchByTitle(title, { mailto, timeoutMs, rows = 3 } = {}) {
  const params = new URLSearchParams({ 'query.bibliographic': title, rows: String(rows), select: 'DOI,title,author,issued,type,container-title,publisher,volume,issue,page,ISSN,ISBN,URL,abstract' })
  if (mailto) params.set('mailto', mailto)
  const body = await httpGetJson(`${BASE}/works?${params}`, { timeoutMs })
  const items = (body.message?.items ?? []).map(normalizeWork).filter(Boolean)
  if (!items.length) return []
  // Crossref's relevance ordering is loose; prefer an exact-ish title match.
  const wanted = title.toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ').trim()
  return items.sort((a, b) => {
    const fa = (a.title ?? '').toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ').trim()
    const fb = (b.title ?? '').toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ').trim()
    const da = fa && wanted && (fa.includes(wanted) || wanted.includes(fa)) ? 0 : 1
    const db = fb && wanted && (fb.includes(wanted) || wanted.includes(fb)) ? 0 : 1
    return da - db
  })
}
