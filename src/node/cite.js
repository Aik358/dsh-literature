/**
 * Citation generation, Scribbr-style. Formats a stored record into reference
 * list entries, in-text citations and direct quotes across a handful of
 * common styles — APA 7th, GB/T 7714-2015 (numeric), MLA 9th, Chicago 17th.
 *
 * The formatters are deliberately compact: they cover journal articles,
 * books, book chapters, preprints, conference papers, theses and reports —
 * the shapes a literature panel actually holds.
 */

const JOURNAL_TYPES = new Set(['journalArticle', 'preprint', 'conferencePaper'])
const BOOK_TYPES = new Set(['book', 'bookSection', 'report', 'thesis'])

function authorsList(record, { max = 99, ellipsis = ', et al.' } = {}) {
  const list = record.authors ?? []
  if (!list.length) return ''
  const names = list.map((a) => [a.lastName, a.firstName].filter(Boolean).join(', '))
  if (names.length === 1) return names[0]
  if (names.length <= max) return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1]
  return names.slice(0, max).join(', ') + ellipsis
}

function authorsShort(record) {
  const list = record.authors ?? []
  if (!list.length) return ''
  if (list.length === 1) return list[0].lastName
  if (list.length === 2) return `${list[0].lastName} & ${list[1].lastName}`
  return `${list[0].lastName} et al.`
}

function yearStr(record) {
  return record.year ? String(record.year) : 'n.d.'
}

function pagesStr(record) {
  const p = record.pages ?? ''
  return p ? p.replace(/-/g, '–') : ''
}

function doiUrl(record) {
  return record.doi ? `https://doi.org/${record.doi}` : record.url ?? ''
}

/** APA 7th edition. */
function apa(record) {
  const authors = authorsList(record, { max: 20 })
  const who = authors ? `${authors}. ` : ''
  const year = `(${yearStr(record)}). `
  const title = (record.title ?? 'Untitled').trim()

  if (record.itemType === 'journalArticle' || record.itemType === 'preprint') {
    const journal = record.container ? `*${record.container}*, ` : ''
    // APA 7 italicises BOTH the journal name and the volume; the issue number
    // in parentheses stays upright. `*Psychology of Popular Media Culture*, *8*(3), 207–217.`
    const vol = record.volume ? `*${record.volume}*` : ''
    const issue = record.issue ? `(${record.issue})` : ''
    const pages = pagesStr(record) ? `, ${pagesStr(record)}` : ''
    // Volume, issue and pages can each be absent independently — never drop
    // the ones that exist just because an earlier field is missing.
    const volPart = vol || issue || pages ? `${vol}${issue}${pages}. ` : ''
    const url = doiUrl(record) ? `${doiUrl(record)}` : ''
    return `${who}${year}${title}. ${journal}${volPart}${url}`.trim()
  }

  if (record.itemType === 'bookSection') {
    const book = record.container ? ` In *${record.container}*` : ''
    const pages = pagesStr(record) ? ` (pp. ${pagesStr(record)})` : ''
    const pub = record.publisher ? `. ${record.publisher}` : ''
    return `${who}${year}${title}.${book}${pages}${pub}.`.trim()
  }

  if (record.itemType === 'book' || record.itemType === 'report' || record.itemType === 'thesis') {
    const pub = record.publisher ? `${record.publisher}.` : ''
    return `${who}${year}*${title}*. ${pub}`.trim()
  }

  if (record.itemType === 'conferencePaper') {
    const proc = record.container ? ` In *${record.container}*` : ''
    const pages = pagesStr(record) ? ` (pp. ${pagesStr(record)})` : ''
    const pub = record.publisher ? `. ${record.publisher}` : ''
    return `${who}${year}${title}.${proc}${pages}${pub}.`.trim()
  }

  return `${who}${year}${title}.`.trim()
}

/** GB/T 7714-2015 (numeric / 顺序编码制). */
function gb(record) {
  const list = record.authors ?? []
  let who
  if (!list.length) who = ''
  else if (list.length <= 3) who = list.map((a) => `${a.lastName}${a.firstName ? ' ' + a.firstName : ''}`).join(', ')
  else who = `${list.slice(0, 3).map((a) => `${a.lastName}${a.firstName ? ' ' + a.firstName : ''}`).join(', ')}, 等`
  const whoPart = who ? `${who}. ` : ''
  const title = (record.title ?? '').trim()
  const year = yearStr(record)

  if (record.itemType === 'journalArticle' || record.itemType === 'preprint') {
    const journal = record.container ? `${record.container}` : ''
    const vol = record.volume ? `, ${record.volume}` : ''
    const issue = record.issue ? `(${record.issue})` : ''
    const pages = pagesStr(record) ? `: ${pagesStr(record).replace(/–/g, '-')}` : ''
    return `${whoPart}${title}[J]. ${journal}, ${year}${vol}${issue}${pages}.`.replace(', , ', ', ').trim()
  }

  if (record.itemType === 'bookSection') {
    const book = record.container ? ` // ${record.container}` : ''
    const pages = pagesStr(record) ? `: ${pagesStr(record).replace(/–/g, '-')}` : ''
    return `${whoPart}${title}[M]${book}. ${record.publisher ?? ''}, ${year}${pages}.`.trim()
  }

  if (record.itemType === 'book' || record.itemType === 'report' || record.itemType === 'thesis') {
    const tag = record.itemType === 'thesis' ? 'D' : record.itemType === 'report' ? 'R' : 'M'
    const pub = record.publisher ? `${record.publisher}, ` : ''
    return `${whoPart}${title}[${tag}]. ${pub}${year}.`.trim()
  }

  if (record.itemType === 'conferencePaper') {
    const proc = record.container ? ` // ${record.container}` : ''
    const pages = pagesStr(record) ? `: ${pagesStr(record).replace(/–/g, '-')}` : ''
    return `${whoPart}${title}[C]${proc}. ${record.publisher ?? ''}, ${year}${pages}.`.trim()
  }

  return `${whoPart}${title}[Z]. ${year}.`.trim()
}

/** MLA 9th edition. */
function mla(record) {
  const list = record.authors ?? []
  const who = list.length ? list.map((a) => `${a.lastName}, ${a.firstName ?? ''}`.trim()).join(', ') + '. ' : ''
  const title = (record.title ?? 'Untitled').trim()
  if (record.itemType === 'journalArticle' || record.itemType === 'preprint') {
    const journal = record.container ? ` *${record.container}*, ` : ''
    const vol = record.volume ? ` vol. ${record.volume},` : ''
    const issue = record.issue ? ` no. ${record.issue},` : ''
    const year = ` ${yearStr(record)},`
    const pages = pagesStr(record) ? ` pp. ${pagesStr(record)}.` : '.'
    const url = doiUrl(record) ? ` ${doiUrl(record)}.` : ''
    return `${who}"${title}." ${journal}${vol}${issue}${year}${pages}${url}`.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim()
  }
  if (record.itemType === 'book' || record.itemType === 'report' || record.itemType === 'thesis') {
    const pub = record.publisher ? ` ${record.publisher},` : ''
    return `${who}*${title}.*${pub} ${yearStr(record)}.`.trim()
  }
  return `${who}"${title}." ${record.publisher ?? ''} ${yearStr(record)}.`.trim()
}

/** Chicago 17th (notes-bibliography, bibliography form). */
function chicago(record) {
  const list = record.authors ?? []
  const who = list.length ? list.map((a) => `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()).join(', ') + '. ' : ''
  const title = (record.title ?? 'Untitled').trim()
  if (record.itemType === 'journalArticle' || record.itemType === 'preprint') {
    // Chicago 17 bibliography: the ARTICLE title takes quotes, the JOURNAL
    // name takes italics — `Doe, Jane. "Title." *Journal* 12, no. 3 (2020): 45–67.`
    // The old code quoted both, producing nested quotes around the journal.
    const journal = record.container ? ` *${record.container}*` : ''
    const vol = record.volume ? ` ${record.volume}` : ''
    const issue = record.issue ? `, no. ${record.issue}` : ''
    const pages = pagesStr(record) ? `: ${pagesStr(record)}` : ''
    return `${who}"${title}."${journal}${vol}${issue} (${yearStr(record)})${pages}.`.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim()
  }
  const pub = record.publisher ? ` ${record.publisher},` : ''
  return `${who}*${title}.*${pub} ${yearStr(record)}.`.trim()
}


/** BibTeX value escaping: braces wrap every value, so only the characters
 *  BibTeX treats specially inside a field need backslash-escaping. */
function bibtexEscape(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[&%#$~^_]/g, (ch) => '\\' + ch)
    .trim()
}

/** BibTeX entry. Key = lastName + year + first significant title word. */
export function bibtex(record) {
  const first = (record.authors ?? [])[0]
  const year = record.year ? String(record.year) : ''
  const title = (record.title ?? '').trim()
  const word = (title.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/)[0] ?? '')
  const key = [first?.lastName ?? 'unknown', year, word].filter(Boolean).join('').replace(/[^\p{L}\p{N}]+/gu, '')

  const type = {
    journalArticle: 'article',
    book: 'book',
    bookSection: 'inbook',
    conferencePaper: 'inproceedings',
    preprint: 'article',
    thesis: 'phdthesis',
    report: 'techreport',
    dataset: 'misc',
  }[record.itemType] ?? 'misc'

  const containerKey = type === 'article' ? 'journal' : (type === 'inbook' || type === 'inproceedings') ? 'booktitle' : 'journal'
  const fields = []
  const authors = (record.authors ?? []).map((a) => [a.lastName, a.firstName].filter(Boolean).join(', ')).join(' and ')
  if (authors) fields.push(['author', authors])
  if (title) fields.push(['title', title])
  if (record.container) fields.push([containerKey, record.container])
  if (year) fields.push(['year', year])
  if (record.volume) fields.push(['volume', String(record.volume)])
  if (record.issue) fields.push(['number', String(record.issue)])
  if (record.pages) fields.push(['pages', String(record.pages)])
  if (record.publisher) fields.push(['publisher', String(record.publisher)])
  if (record.doi) fields.push(['doi', String(record.doi)])
  if (record.isbn) fields.push(['isbn', String(record.isbn)])
  if (record.url) fields.push(['url', String(record.url)])
  if (record.arxiv) fields.push(['note', 'arXiv:' + String(record.arxiv)])

  const body = fields.map(([k, v]) => `  ${k} = {${bibtexEscape(v)}}`).join(',\n')
  return '@' + type + '{' + key + ',\n' + body + '\n}\n'
}

const STYLES = {
  apa: { label: 'APA 7th', format: apa },
  gb: { label: 'GB/T 7714-2015', format: gb },
  mla: { label: 'MLA 9th', format: mla },
  chicago: { label: 'Chicago 17th', format: chicago },
  bibtex: { label: 'BibTeX', format: bibtex },
}

/**
 * The formatters above mark italics with `*…*` (Markdown-style). These two
 * helpers turn that markup into display forms; the asterisks must never reach
 * the user's clipboard as literal characters.
 */

/** Strips italic markers, leaving plain text. */
export function stripItalic(text) {
  return String(text ?? '').replace(/\*([^*]+)\*/g, '$1')
}

/** Splits `*italic*` markup into segments: [{ text, italic? }]. */
export function toSegments(text) {
  const s = String(text ?? '')
  const out = []
  const re = /\*([^*]+)\*/g
  let last = 0
  let m
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    out.push({ text: m[1], italic: true })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out.length ? out : [{ text: s }]
}

/** Escapes HTML special characters (order matters: ampersand first). */
function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Renders segments to HTML with real <i> italics. */
export function segmentsToHtml(segments) {
  return segments.map((seg) => (seg.italic ? `<i>${escapeHtml(seg.text)}</i>` : escapeHtml(seg.text))).join('')
}

/**
 * @param {object} record normalised metadata record
 * @param {object} opts { style: 'apa'|'gb'|'mla'|'chicago', mode: 'reference'|'intext'|'direct', pages?: string }
 */
export function cite(record, opts = {}) {
  return citeDetailed(record, opts).text
}

/**
 * Same decision tree as above, but returns everything the UI dialog needs:
 * plain text for the clipboard's text/plain flavor, segments for rendering,
 * and pre-escaped HTML for the text/html flavor (pasting into Word/Docs
 * preserves the italics).
 */
export function citeDetailed(record, opts = {}) {
  const style = STYLES[opts.style] ?? STYLES.apa
  const mode = opts.mode ?? 'reference'

  // BibTeX has no in-text / direct-quote semantics — it is always a reference.
  if (opts.style === 'bibtex') {
    const text = style.format(record)
    return { text, segments: [{ text }], html: escapeHtml(text), style: opts.style, mode: 'reference' }
  }

  let raw
  if (mode === 'intext') {
    if (opts.style === 'gb') {
      // GB/T 7714 numeric style quotes by the bracketed number [n]; without a
      // running bibliography the author-year variant is the honest fallback.
      raw = `（${authorsShortGb(record)}，${yearStr(record)}）`
    } else {
      raw = `(${authorsShort(record)}, ${yearStr(record)})`
    }
  } else if (mode === 'direct') {
    const pages = opts.pages ? (opts.style === 'gb' ? `，第 ${opts.pages} 页` : `, p. ${opts.pages}`) : ''
    if (opts.style === 'gb') raw = `“${(record.title ?? '').trim()}”（${authorsShortGb(record)}，${yearStr(record)}${pages}）`
    else raw = `"${(record.title ?? '').trim()}" (${authorsShort(record)}, ${yearStr(record)}${pages})`
  } else {
    raw = style.format(record)
  }

  const text = stripItalic(raw)
  const segments = toSegments(raw)
  return { text, segments, html: segmentsToHtml(segments), style: opts.style ?? 'apa', mode }
}

function authorsShortGb(record) {
  const list = record.authors ?? []
  if (!list.length) return '佚名'
  if (list.length === 1) return list[0].lastName
  if (list.length === 2) return `${list[0].lastName}、${list[1].lastName}`
  return `${list[0].lastName}等`
}

export function listStyles() {
  return Object.entries(STYLES).map(([id, s]) => ({ id, label: s.label }))
}
