import { httpGetJson } from '../net.js'

/**
 * Loose title / text search returning candidate records the user can pick
 * from — the Scribbr "Autocite" pattern. Backed by the Crossref bibliographic
 * search endpoint; no API key required.
 */

function crossrefType(t) {
  switch (t) {
    case 'journal-article':
      return 'journalArticle'
    case 'book':
      return 'book'
    case 'book-chapter':
      return 'bookSection'
    case 'proceedings-article':
      return 'conferencePaper'
    case 'posted-content':
      return 'preprint'
    case 'dissertation':
      return 'thesis'
    case 'report':
      return 'report'
    case 'webpage':
      return 'webpage'
    default:
      return 'journalArticle'
  }
}

/** Searches Crossref for a title / pasted text and returns normalised records. */
export async function searchCandidates(query, { rows = 8 } = {}) {
  const q = String(query ?? '').trim()
  if (!q) return []

  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${Math.max(1, Math.min(rows, 20))}&select=DOI,title,author,issued,container-title,type,volume,issue,page`
  let data
  try {
    data = await httpGetJson(url)
  } catch {
    return []
  }

  const out = []
  for (const it of data?.message?.items ?? []) {
    const title = it.title?.[0]
    if (!title) continue
    out.push({
      doi: it.DOI ?? '',
      title,
      authors: (it.author ?? []).map((a) => ({ firstName: a.given ?? '', lastName: a.family ?? '' })),
      year: it.issued?.['date-parts']?.[0]?.[0] ?? null,
      container: it['container-title']?.[0] ?? '',
      volume: it.volume ?? '',
      issue: it.issue ?? '',
      pages: it.page ?? '',
      itemType: crossrefType(it.type),
    })
  }
  return out
}
