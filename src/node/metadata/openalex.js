import { httpGetJson } from '../net.js'

const BASE = 'https://api.openalex.org'

/**
 * OpenAlex is the fallback when Crossref has nothing — it indexes a broader
 * slice of the literature and, unlike Crossref, reports open-access PDF links
 * directly in the work record.
 */

const TYPE_MAP = {
  article: 'journalArticle',
  book: 'book',
  'book-chapter': 'bookSection',
  editorial: 'journalArticle',
  letter: 'journalArticle',
  preprint: 'preprint',
  dataset: 'dataset',
  review: 'journalArticle',
  dissertation: 'thesis',
  'peer-review': 'journalArticle',
  'reference-entry': 'journalArticle',
}

function reconstructAbstract(inverted) {
  if (!inverted || typeof inverted !== 'object') return ''
  const slots = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const p of positions) slots[p] = word
  }
  return slots.filter(Boolean).join(' ').trim()
}

export function normalizeWork(work) {
  if (!work) return null
  const authors = (work.authorships ?? []).map((a) => {
    const name = (a.author?.display_name ?? '').trim()
    const parts = name.split(/\s+/)
    return {
      creatorType: 'author',
      firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      lastName: parts[parts.length - 1] ?? name,
    }
  })

  const loc = work.primary_location ?? work.best_oa_location ?? {}
  const venue = loc.source ?? {}
  const oa = work.best_oa_location ?? {}

  const biblio = work.biblio ?? {}

  return {
    source: 'openalex',
    itemType: TYPE_MAP[work.type] ?? 'journalArticle',
    title: (work.title ?? work.display_name ?? '').trim(),
    authors,
    year: work.publication_year ?? null,
    container: venue.display_name ?? '',
    publisher: venue.host_organization_name ?? '',
    volume: biblio.volume ?? '',
    issue: biblio.issue ?? '',
    pages: [biblio.first_page, biblio.last_page].filter(Boolean).join('-'),
    doi: (work.doi ?? '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''),
    isbn: Array.isArray(work.isbns) ? work.isbns[0] ?? '' : '',
    issn: Array.isArray(venue.issn) ? venue.issn[0] ?? '' : venue.issn_l ?? '',
    url: work.doi ?? work.id ?? '',
    abstract: reconstructAbstract(work.abstract_inverted_index),
    language: work.language_code ?? '',
    openAccess: {
      isOa: !!work.open_access?.is_oa,
      pdfUrl: oa.pdf_url ?? '',
      landingPageUrl: oa.landing_page_url ?? '',
    },
    raw: work,
  }
}

export async function fetchByDoi(doi, { mailto, timeoutMs } = {}) {
  const clean = String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  const url = `${BASE}/works/doi:${encodeURIComponent(clean)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`
  try {
    return normalizeWork(await httpGetJson(url, { timeoutMs }))
  } catch (e) {
    if (e?.status === 404) return null
    throw e
  }
}

export async function searchByTitle(title, { mailto, timeoutMs, rows = 3 } = {}) {
  const params = new URLSearchParams({ search: title, per_page: String(rows) })
  if (mailto) params.set('mailto', mailto)
  const body = await httpGetJson(`${BASE}/works?${params}`, { timeoutMs })
  return (body.results ?? []).map(normalizeWork).filter(Boolean)
}
