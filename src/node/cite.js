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
    const vol = record.volume ? `${record.volume}` : ''
    const issue = record.issue ? `(${record.issue})` : ''
    const pages = pagesStr(record) ? `, ${pagesStr(record)}` : ''
    const volPart = vol ? `${vol}${issue}${pages}. ` : ''
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
    const journal = record.container ? ` "${record.container}"` : ''
    const vol = record.volume ? ` ${record.volume}` : ''
    const issue = record.issue ? `, no. ${record.issue}` : ''
    const pages = pagesStr(record) ? `: ${pagesStr(record)}` : ''
    return `${who}"${title}.${journal}" ${vol}${issue} (${yearStr(record)})${pages}.`.trim()
  }
  const pub = record.publisher ? ` ${record.publisher},` : ''
  return `${who}*${title}.*${pub} ${yearStr(record)}.`.trim()
}

const STYLES = {
  apa: { label: 'APA 7th', format: apa },
  gb: { label: 'GB/T 7714-2015', format: gb },
  mla: { label: 'MLA 9th', format: mla },
  chicago: { label: 'Chicago 17th', format: chicago },
}

/**
 * @param {object} record normalised metadata record
 * @param {object} opts { style: 'apa'|'gb'|'mla'|'chicago', mode: 'reference'|'intext'|'direct', pages?: string }
 */
export function cite(record, opts = {}) {
  const style = STYLES[opts.style] ?? STYLES.apa
  const mode = opts.mode ?? 'reference'

  if (mode === 'intext') {
    if (opts.style === 'gb') {
      // GB/T 7714 numeric style quotes by the bracketed number [n]; without a
      // running bibliography the author-year variant is the honest fallback.
      return `（${authorsShortGb(record)}，${yearStr(record)}）`
    }
    return `(${authorsShort(record)}, ${yearStr(record)})`
  }

  if (mode === 'direct') {
    const pages = opts.pages ? (opts.style === 'gb' ? `，第 ${opts.pages} 页` : `, p. ${opts.pages}`) : ''
    if (opts.style === 'gb') return `“${(record.title ?? '').trim()}”（${authorsShortGb(record)}，${yearStr(record)}${pages}）`
    return `"${(record.title ?? '').trim()}" (${authorsShort(record)}, ${yearStr(record)}${pages})`
  }

  return style.format(record)
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
