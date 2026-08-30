import { httpGetJson } from '../net.js'
import * as crossref from './crossref.js'
import * as arxiv from './arxiv.js'
import * as openalex from './openalex.js'
import { warn } from '../log.js'

/**
 * Resolves an identifier (or a title) into a normalised metadata record by
 * trying providers in order of how trustworthy they are for that identifier
 * type. Failure of one provider is never fatal — we just fall through.
 */

const ID_CONVERTER = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/'

async function pmidToDoi(pmid, timeoutMs) {
  try {
    const body = await httpGetJson(`${ID_CONVERTER}?ids=${encodeURIComponent(pmid)}&format=json`, { timeoutMs })
    const rec = body?.records?.[0]
    return rec?.doi ?? ''
  } catch (e) {
    warn('pmid -> doi conversion failed:', e.message)
    return ''
  }
}

async function firstResult(fn, label) {
  try {
    return await fn()
  } catch (e) {
    warn(`${label} lookup failed:`, e.message)
    return null
  }
}

export async function resolveIdentifier(id, { timeoutMs = 20000, unpaywallEmail = '' } = {}) {
  const mailto = unpaywallEmail || undefined

  if (id.kind === 'doi') {
    return (
      (await firstResult(() => crossref.fetchByDoi(id.value, { mailto, timeoutMs }), 'crossref/doi')) ??
      (await firstResult(() => openalex.fetchByDoi(id.value, { mailto, timeoutMs }), 'openalex/doi'))
    )
  }

  if (id.kind === 'arxiv') {
    const direct = await firstResult(() => arxiv.fetchById(id.value, { timeoutMs }), 'arxiv/id')
    if (direct) {
      // A preprint that has since been published carries a DOI worth preferring.
      if (direct.doi) {
        const published = await firstResult(() => crossref.fetchByDoi(direct.doi, { mailto, timeoutMs }), 'crossref/doi')
        if (published) return { ...published, arxiv: direct.arxiv, pdfUrl: direct.pdfUrl, preprint: direct }
      }
      return direct
    }
    return null
  }

  if (id.kind === 'pmid') {
    const doi = await pmidToDoi(id.value, timeoutMs)
    if (doi) {
      const rec = await firstResult(() => crossref.fetchByDoi(doi, { mailto, timeoutMs }), 'crossref/doi')
      if (rec) return { ...rec, pmid: id.value }
    }
    return null
  }

  if (id.kind === 'isbn') {
    return (
      (await firstResult(() => openalex.searchByTitle(id.value, { mailto, timeoutMs, rows: 1 }), 'openalex/isbn'))?.[0] ??
      null
    )
  }

  if (id.kind === 'title') {
    const cr = await firstResult(() => crossref.searchByTitle(id.value, { mailto, timeoutMs, rows: 3 }), 'crossref/title')
    if (cr?.length) return cr[0]
    const ax = await firstResult(() => arxiv.searchByTitle(id.value, { timeoutMs, rows: 3 }), 'arxiv/title')
    if (ax?.length) return ax[0]
    const oa = await firstResult(() => openalex.searchByTitle(id.value, { mailto, timeoutMs, rows: 3 }), 'openalex/title')
    if (oa?.length) return oa[0]
    return null
  }

  return null
}
