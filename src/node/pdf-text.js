import { readFile } from 'node:fs/promises'
import { warn } from './log.js'

/**
 * Extracts plain text from a PDF on the host side (no canvas, no worker —
 * pdf.js's legacy build runs a fake worker on the main thread in Node).
 * Used by the AI-assist flow so the model can answer from the full text.
 *
 * ⚠️ pdf.js is loaded LAZILY inside extractPdfText: importing
 * `pdfjs-dist/legacy/build/pdf.mjs` takes ~400ms and BLOCKS the event loop
 * (verified with a heartbeat probe). A static import anywhere in the module
 * graph would freeze the whole `dsh web` host — including every API request
 * and the chat history feed — the moment the plugin loads or the first
 * session event fires. Lazy import confines the stall to the actual moment a
 * user asks the AI a question.
 */

const DEFAULT_MAX_CHARS = 120000
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map() // abs path -> { text, at }

let pdfjsPromise = null

async function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((e) => {
    pdfjsPromise = null
    throw e
  })
  return pdfjsPromise
}

/**
 * @param {string} pdfPath absolute path to a stored PDF
 * @param {{maxChars?: number, force?: boolean}} [options]
 * @returns {Promise<string>} extracted text (page runs joined by \n)
 */
export async function extractPdfText(pdfPath, { maxChars = DEFAULT_MAX_CHARS, force = false } = {}) {
  const hit = cache.get(pdfPath)
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text

  const data = new Uint8Array(await readFile(pdfPath))
  const getDocument = (await pdfjs()).getDocument
  const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise
  const chunks = []
  let total = 0
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const line = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
      chunks.push(line)
      total += line.length
      if (total >= maxChars) break
    }
  } finally {
    // The legacy (worker-less) build exposes destroy on the loading task only.
    await doc.loadingTask?.destroy?.().catch(() => {})
    doc.cleanup?.()
  }

  const text = chunks.join('\n').trim()
  cache.set(pdfPath, { text, at: Date.now() })
  return text
}

/** Drops the cache entry for a stored PDF (called after the file is replaced). */
export function forgetPdfText(pdfPath) {
  cache.delete(pdfPath)
}
