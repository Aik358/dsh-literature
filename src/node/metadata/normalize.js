/**
 * Maps a normalised metadata record onto the item JSON the Zotero Connector
 * API expects. Field names must match Zotero's own schema — `abstractNote` not
 * `abstract`, `publicationTitle` not `container` — or the values are silently
 * dropped on save.
 */

const BASE_FIELDS = ['title', 'abstractNote', 'shortTitle', 'url', 'accessDate', 'language', 'rights', 'extra', 'DOI']

const TYPE_FIELDS = {
  journalArticle: ['publicationTitle', 'journalAbbreviation', 'volume', 'issue', 'pages', 'ISSN'],
  book: ['publisher', 'place', 'edition', 'numberOfVolumes', 'ISBN', 'series', 'seriesNumber'],
  bookSection: ['bookTitle', 'publisher', 'place', 'edition', 'pages', 'ISBN', 'series', 'seriesNumber'],
  conferencePaper: ['conferenceName', 'proceedingsTitle', 'publisher', 'place', 'pages', 'DOI'],
  preprint: ['repository', 'archiveID', 'publisher', 'DOI'],
  thesis: ['thesisType', 'university', 'place'],
  report: ['reportNumber', 'reportType', 'institution', 'place'],
  dataset: ['repository', 'publisher', 'versionNumber'],
  standard: ['organization', 'publisher', 'place'],
}

function cleanStr(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\s+/g, ' ').trim()
}

function isoDate(record) {
  if (record.year) return String(record.year)
  const raw = cleanStr(record.date)
  return raw
}

/**
 * @param {object} record normalised metadata record
 * @param {{clientId: string, tags?: string[], extra?: string}} options
 */
export function toZoteroItem(record, { clientId, tags = [], extra = '' } = {}) {
  const itemType = TYPE_FIELDS[record.itemType] ? record.itemType : 'journalArticle'
  const allowed = new Set([...BASE_FIELDS, ...TYPE_FIELDS[itemType]])

  const item = {
    id: clientId,
    itemType,
    title: cleanStr(record.title) || 'Untitled',
    creators: (record.authors ?? []).filter((a) => a && (a.lastName || a.firstName)).map((a) => ({
      creatorType: a.creatorType ?? 'author',
      firstName: cleanStr(a.firstName),
      lastName: cleanStr(a.lastName),
    })),
  }

  const set = (field, value) => {
    if (!allowed.has(field)) return
    const v = cleanStr(value)
    if (v) item[field] = v
  }

  set('abstractNote', record.abstract)
  set('DOI', record.doi)
  set('ISBN', record.isbn)
  set('ISSN', record.issn)
  set('url', record.url)
  set('language', record.language)
  set('publisher', record.publisher)
  set('volume', record.volume)
  set('issue', record.issue)
  set('pages', record.pages)
  set('date', isoDate(record))

  if (itemType === 'journalArticle') set('publicationTitle', record.container)
  if (itemType === 'bookSection') set('bookTitle', record.container)
  if (itemType === 'conferencePaper') set('proceedingsTitle', record.container)
  if (itemType === 'preprint') {
    set('repository', record.container || 'arXiv')
    set('archiveID', record.arxiv)
  }
  if (itemType === 'dataset') set('repository', record.container)

  item.accessDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const extraParts = []
  if (record.arxiv) extraParts.push(`arXiv:${record.arxiv}`)
  if (record.pmid) extraParts.push(`PMID: ${record.pmid}`)
  if (extra) extraParts.push(extra)
  if (extraParts.length) item.extra = extraParts.join('\n')

  if (tags.length) item.tags = tags.map((t) => ({ tag: t }))

  // The connector saves attachments through a separate request; declaring none
  // here keeps it from trying to fetch anything on its own.
  item.attachments = []

  return item
}

/** Short, human-facing label used in the side panel before metadata lands. */
export function shortLabel(record) {
  const authors = record.authors ?? []
  const first = authors[0]?.lastName ?? ''
  const suffix = authors.length > 1 ? ' 等' : ''
  const who = first ? `${first}${suffix}` : (record.container || '未命名')
  const year = record.year ? ` ${record.year}` : ''
  return `${who}${year}`.trim()
}
