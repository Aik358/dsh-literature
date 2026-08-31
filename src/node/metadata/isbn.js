import { httpGetJson } from '../net.js'

/**
 * ISBN → book metadata via the Open Library Books API (no key required).
 * OpenAlex exposes no `isbn` filter and Google Books rate-limits keyless
 * requests, so Open Library is the dependable public source here.
 */

const OL_BASE = 'https://openlibrary.org/api/books'

function splitName(name) {
  const s = (name ?? '').trim()
  if (!s) return { firstName: '', lastName: '' }
  // "Maeda, John" -> last="Maeda", first="John"
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((p) => p.trim())
    return { firstName: first ?? '', lastName: last ?? '' }
  }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/** Maps an Open Library `jscmd=data` entry onto the normalised record shape. */
export function normalizeOpenLibrary(data) {
  if (!data || !data.title) return null
  const year = /(\d{4})/.exec(String(data.publish_date ?? ''))?.[1]
  const authors = (data.authors ?? [])
    .map((a) => ({ creatorType: 'author', ...splitName(a?.name ?? '') }))
    .filter((a) => a.lastName)
  return {
    source: 'openlibrary',
    itemType: 'book',
    title: data.title,
    authors,
    year: year ? Number(year) : null,
    container: '',
    publisher: (data.publishers ?? []).map((p) => p?.name).filter(Boolean).join('; '),
    volume: '',
    issue: '',
    pages: data.number_of_pages ? String(data.number_of_pages) : '',
    doi: '',
    isbn: '',
    issn: '',
    url: data.url || (data.identifiers?.openlibrary ? `https://openlibrary.org${data.identifiers.openlibrary[0]}` : ''),
    abstract: '',
    raw: data,
  }
}

/**
 * @param {string} isbn ISBN-10 or ISBN-13, separators tolerated
 * @returns {Promise<object|null>} normalised record, or null on no match
 */
export async function fetchByIsbn(isbn, { timeoutMs = 15000 } = {}) {
  const clean = String(isbn ?? '').replace(/[-\s]/g, '').toUpperCase()
  if (!clean) return null
  // Open Library keys on the exact ISBN it holds; try both lengths.
  const bibkeys = [clean]
  const other = clean.length === 13 ? toIsbn10(clean) : toIsbn13(clean)
  if (other) bibkeys.push(other)
  const query = bibkeys.map((k) => `ISBN:${k}`).join(',')
  const body = await httpGetJson(`${OL_BASE}?bibkeys=${encodeURIComponent(query)}&format=json&jscmd=data`, { timeoutMs })
  for (const k of bibkeys) {
    const entry = body?.[`ISBN:${k}`]
    if (entry?.title) return normalizeOpenLibrary(entry)
  }
  return null
}

/** ISBN-13 (978/979 prefix) → ISBN-10 check-digit form; '' when not possible. */
function toIsbn10(isbn13) {
  const s = String(isbn13).replace(/[^0-9]/g, '')
  if (!/^978\d{10}$/.test(s)) return ''
  const digits = s.slice(3, 12).split('').map(Number)
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += digits[i] * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return `0${digits.join('')}${check === 10 ? 'X' : check}`
}

/** ISBN-10 → ISBN-13. Returns '' when not convertible. */
function toIsbn13(isbn10) {
  const s = String(isbn10).replace(/[^0-9Xx]/g, '').toUpperCase()
  if (!/^[0-9]{9}[0-9X]$/.test(s)) return ''
  const digits = `978${s.slice(0, 9)}`.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += digits[i] * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return `${digits.join('')}${check}`
}
