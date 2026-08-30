/**
 * Identity rules for literature items. Two mentions of the same paper must
 * collapse into one side-panel entry whether they arrive as a DOI, an arXiv id,
 * or a title string — and must stay distinct from a different paper that
 * merely shares an author or a year.
 */

export function normalizeDoi(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;。；]$/, '')
    .toLowerCase()
}

export function normalizeArxiv(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, '')
    .replace(/\.pdf$/i, '')
    .replace(/^arxiv:\s*/i, '')
    .toLowerCase()
}

/** `2401.12345v2` -> `2401.12345`, so a revised upload is not a new paper. */
export function arxivBase(value) {
  return normalizeArxiv(value).replace(/v\d+$/, '')
}

export function normalizeIsbn(value) {
  return String(value ?? '').replace(/[-\s]/g, '').toUpperCase()
}

/**
 * Loose title fingerprint. Keeps CJK, Latin letters and digits, drops
 * punctuation and fillers, and truncates so that long subtitles don't defeat
 * matching.
 */
export function titleFingerprint(title) {
  if (!title) return ''
  return String(title)
    .toLowerCase()
    .replace(/[‘’“”「」『』《》〈〉"'`]/g, '')
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

/** The primary identity of an item: the strongest identifier it carries. */
export function identityKey({ doi, arxiv, isbn, pmid, title }) {
  const d = normalizeDoi(doi)
  if (d) return `doi:${d}`
  const a = arxivBase(arxiv)
  if (a) return `arxiv:${a}`
  const i = normalizeIsbn(isbn)
  if (i) return `isbn:${i}`
  if (pmid) return `pmid:${String(pmid)}`
  const t = titleFingerprint(title)
  if (t) return `title:${t}`
  return ''
}

/**
 * Secondary keys used to recognise the same work arriving under a different
 * identifier — e.g. a preprint that later got a DOI.
 */
export function aliasKeys({ doi, arxiv, isbn, pmid, title }) {
  const keys = new Set()
  const d = normalizeDoi(doi)
  const a = arxivBase(arxiv)
  const i = normalizeIsbn(isbn)
  const t = titleFingerprint(title)
  if (d) keys.add(`doi:${d}`)
  if (a) keys.add(`arxiv:${a}`)
  if (i) keys.add(`isbn:${i}`)
  if (pmid) keys.add(`pmid:${String(pmid)}`)
  if (t) keys.add(`title:${t}`)
  return [...keys]
}

/**
 * Normalises a raw metadata record into the shape the shadow store keeps, and
 * attaches the identity keys used for dedupe.
 */
export function buildItem(meta) {
  const doi = normalizeDoi(meta.doi) || ''
  const arxiv = arxivBase(meta.arxiv) || ''
  const isbn = normalizeIsbn(meta.isbn) || ''
  const pmid = meta.pmid ? String(meta.pmid) : ''
  const title = (meta.title ?? '').trim()

  const base = { doi, arxiv, isbn, pmid, title }
  const key = identityKey(base)
  return {
    key,
    aliases: aliasKeys(base),
    ...base,
    authors: meta.authors ?? [],
    year: meta.year ?? null,
    container: meta.container ?? '',
    publisher: meta.publisher ?? '',
    abstract: meta.abstract ?? '',
    url: meta.url ?? '',
    itemType: meta.itemType ?? 'journalArticle',
    raw: meta.raw ?? meta,
  }
}

/** True when two records describe the same work. */
export function sameWork(a, b) {
  const ka = a.aliases ?? aliasKeys(a)
  const kb = b.aliases ?? aliasKeys(b)
  return ka.some((k) => kb.includes(k))
}
