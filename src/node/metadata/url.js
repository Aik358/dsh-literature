import { httpGet } from '../net.js'

/**
 * Resolves an arbitrary web URL into a minimal bibliographic record by
 * reading the page's own metadata (citation_* meta tags, Open Graph, <title>)
 * — the same trick the Scribbr Chrome extension uses on the page you visit.
 */

const META_PATTERNS = [
  // <meta name="citation_title" content="..."> — order of attrs varies
  /<meta[^>]+name=["']citation_title["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_title["']/i,
  // Open Graph
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
  // fallback
  /<title[^>]*>([^<]+)<\/title>/i,
]

const DOI_PATTERNS = [
  /<meta[^>]+name=["']citation_doi["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_doi["']/i,
]

const AUTHOR_PATTERNS = [
  /<meta[^>]+name=["']citation_author["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_author["']/i,
]

const DATE_PATTERNS = [
  /<meta[^>]+name=["']citation_publication_date["'][^>]+content=["'](\d{4})/i,
  /<meta[^>]+content=["'](\d{4})["'][^>]+name=["']citation_publication_date["']/i,
]

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

/** Fetches a URL and extracts what bibliographic metadata the page exposes. */
export async function resolveUrlPage(url, { timeoutMs = 15000 } = {}) {
  let html = ''
  let error = ''
  try {
    const res = await httpGet(url, {
      timeoutMs,
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      // Many publisher pages 403 bare requests; a browser UA keeps them open.
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    })
    html = await res.text()
  } catch (e) {
    error = e?.message ?? String(e)
  }

  const title = firstMatch(html, META_PATTERNS)
  const doi = firstMatch(html, DOI_PATTERNS)
  const author = firstMatch(html, AUTHOR_PATTERNS)
  const year = firstMatch(html, DATE_PATTERNS)
  const cleanedTitle = title.replace(/[|–-].*$/, '').trim() // drop site suffixes

  return {
    title: cleanedTitle || '',
    doi,
    authors: author ? [{ firstName: '', lastName: author }] : [],
    year: year ? Number(year) : null,
    url,
    error,
  }
}
