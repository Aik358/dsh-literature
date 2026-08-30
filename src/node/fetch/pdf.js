import { httpGetBuffer, httpGetJson, FetchFailure } from '../net.js'
import { log, warn } from '../log.js'

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1')

export class PdfFailure extends Error {
  constructor(message, code, { retryable = false, detail } = {}) {
    super(message)
    this.name = 'PdfFailure'
    this.code = code
    this.retryable = retryable
    this.detail = detail
  }
}

function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 8) return false
  return buffer.subarray(0, 5).equals(PDF_MAGIC)
}

/**
 * Collects candidate PDF URLs, most promising first. Nothing here contacts a
 * paywalled source on the user's behalf — only publisher-advertised open
 * access locations are used.
 */
async function candidates(record, { unpaywallEmail } = {}) {
  const out = []

  const push = (url, source, kind = 'pdf') => {
    if (!url) return
    out.push({ url: String(url), source, kind })
  }

  if (record.arxiv) {
    const base = String(record.arxiv).replace(/v\d+$/, '')
    push(`https://arxiv.org/pdf/${base}`, 'arXiv', 'pdf')
  }

  if (record.pdfUrl) push(record.pdfUrl, record.source ?? 'metadata')

  if (record.openAccess?.pdfUrl) push(record.openAccess.pdfUrl, 'OpenAlex OA', 'pdf')

  const doi = record.doi
  if (doi) {
    // OpenAlex reports open-access PDFs without any key or email.
    try {
      const oa = await httpGetJson(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`, { timeoutMs: 10000 })
      const best = oa.best_oa_location ?? {}
      push(best.pdf_url, 'OpenAlex OA', 'pdf')
      if (!best.pdf_url) push(best.landing_page_url, 'OpenAlex OA', 'landing')
    } catch (e) {
      warn('openalex oa lookup failed:', e.message)
    }

    if (unpaywallEmail) {
      try {
        const body = await httpGetJson(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(unpaywallEmail)}`, { timeoutMs: 15000 })
        const best = body.best_oa_location
        if (best) {
          push(best.url_for_pdf, 'Unpaywall', 'pdf')
          push(best.url, 'Unpaywall', 'landing')
        }
        for (const loc of body.oa_locations ?? []) {
          push(loc.url_for_pdf, 'Unpaywall', 'pdf')
        }
      } catch (e) {
        warn('unpaywall lookup failed:', e.message)
      }
    }

    // Some publishers hand back a PDF when the DOI is requested with an
    // explicit Accept header; others redirect to a landing page.
    push(`https://doi.org/${encodeURIComponent(doi)}`, 'DOI resolution', 'landing')

    try {
      const cr = await httpGetJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { timeoutMs: 15000 })
      for (const link of cr.message?.link ?? []) {
        if (link['content-type'] === 'application/pdf') push(link.URL, 'Crossref link', 'pdf')
      }
    } catch (e) {
      warn('crossref link lookup failed:', e.message)
    }
  }

  // Drop duplicates while preserving order.
  const seen = new Set()
  return out.filter((c) => {
    const k = c.url.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Most publisher pages embed their PDF location in a citation meta tag. */
function extractPdfUrlFromHtml(html, baseUrl) {
  const re =
    /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_pdf_url["']/i.exec(html)
  if (re) {
    try {
      return new URL(re[1], baseUrl).href
    } catch {
      /* malformed */
    }
  }
  const link = /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/pdf["'][^>]+href=["']([^"']+)["']/i.exec(html)
  if (link) {
    try {
      return new URL(link[1], baseUrl).href
    } catch {
      /* malformed */
    }
  }
  return null
}

/** Login / institutional-signal hints in a landing page. */
const LOGIN_HINT =
  /\bsign\s*in\b|\blog\s*in\b|login|登录|登錄|institutional\s*access|sso|okta|ezproxy|shibboleth|athens|your\s+institution/i

/**
 * Downloads a full-text PDF for `record`.
 * @returns {Promise<{buffer: Buffer, url: string, source: string}>}
 * @throws {PdfFailure} with a code the UI turns into a specific message
 */
export async function fetchPdf(record, { timeoutMs = 30000, unpaywallEmail = '' } = {}) {
  const list = await candidates(record, { unpaywallEmail })
  if (!list.length) {
    throw new PdfFailure('没有可用的全文来源', 'no_source', { retryable: false })
  }

  const failures = []
  const pending = [...list]

  while (pending.length) {
    const cand = pending.shift()
    try {
      const { buffer, contentType, finalUrl } = await httpGetBuffer(cand.url, {
        timeoutMs,
        accept: 'application/pdf,*/*;q=0.8',
      })

      if (looksLikePdf(buffer)) {
        log(`pdf ok: ${cand.url} (${(buffer.length / 1024).toFixed(0)} KB via ${cand.source})`)
        return { buffer, url: finalUrl || cand.url, source: cand.source }
      }

      const isHtml = /text\/html|application\/xhtml/i.test(contentType)
      if (isHtml) {
        const html = buffer.toString('utf8', 0, Math.min(buffer.length, 2 * 1024 * 1024))
        const discovered = extractPdfUrlFromHtml(html, finalUrl || cand.url)
        if (discovered) {
          pending.unshift({ url: discovered, source: `${cand.source} (PDF 链接)`, kind: 'pdf' })
          continue
        }
        failures.push({
          url: cand.url,
          source: cand.source,
          reason: 'landing page, no discoverable PDF link',
          needsLogin: LOGIN_HINT.test(html),
        })
        continue
      }
      failures.push({ url: cand.url, source: cand.source, reason: `unexpected content-type ${contentType || 'unknown'}` })
    } catch (e) {
      if (e instanceof FetchFailure && e.code === 'not_found') {
        failures.push({ url: cand.url, source: cand.source, reason: '404' })
        continue
      }
      failures.push({ url: cand.url, source: cand.source, reason: e.message })
    }
  }

  const sawLandingOnly = failures.length > 0 && failures.every((f) => /landing page|404/.test(f.reason))
  const needsLogin = failures.some((f) => f.needsLogin)
  const code = needsLogin ? 'needs_login' : sawLandingOnly ? 'paywalled' : 'network'
  throw new PdfFailure(
    code === 'needs_login'
      ? '该文献需要登录或机构权限，请在浏览器登录后下载，再导入本地 PDF'
      : sawLandingOnly
        ? '该文献没有开放获取全文（可能是付费墙）'
        : '所有全文来源均下载失败',
    code,
    { retryable: !sawLandingOnly && !needsLogin, detail: failures },
  )
}

export { looksLikePdf }
