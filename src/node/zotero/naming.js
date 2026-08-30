const ILLEGAL = /[<>:"\/\\|?*\u0000-\u001f]/g

/**
 * Zotero renames stored attachments itself (`Author - Year - Title.pdf`), but
 * the directory-export channel needs the same shape, and the panel shows the
 * prospective filename before saving.
 */

function safe(part) {
  return String(part ?? '')
    .replace(ILLEGAL, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Windows has a 255-char component limit; leave room for the extension. */
function clampPart(part, max) {
  const s = safe(part)
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

export function firstAuthorLabel(authors) {
  const list = authors ?? []
  if (!list.length) return 'Unknown'
  const first = list[0]
  const name = [first.lastName, first.firstName].filter(Boolean).join(', ')
  return name || 'Unknown'
}

/**
 * @param {object} record normalised metadata
 * @param {string} template e.g. `{author}_{year}_{title}`
 * @param {{maxLength?: number}} [options]
 */
export function renderName(record, template = '{author}_{year}_{title}', { maxLength = 180 } = {}) {
  const tokens = {
    author: firstAuthorLabel(record.authors),
    authors: (record.authors ?? []).map((a) => a.lastName).filter(Boolean).slice(0, 3).join('-') || 'Unknown',
    year: record.year ? String(record.year) : 'n.d.',
    title: record.title || 'Untitled',
    journal: record.container || record.publisher || '',
    doi: (record.doi || '').replace(/[^\w.-]+/g, '_'),
    arxiv: (record.arxiv || '').replace(/[^\w.-]+/g, '_'),
  }

  let out = String(template)
  for (const [key, value] of Object.entries(tokens)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }
  // A template may reference nothing at all; fall back rather than emit an empty name.
  if (!out.trim()) out = '{author}_{year}_{title}'
  if (!out.trim()) out = 'Untitled'

  return clampPart(out, maxLength)
}

export function pdfFileName(record, template) {
  return `${renderName(record, template)}.pdf`
}
