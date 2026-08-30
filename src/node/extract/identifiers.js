/**
 * Pulls literature identifiers out of free text — model replies, pasted
 * references, tool results. Everything here is deliberately conservative: a
 * false positive turns into a bogus side-panel entry, which is worse than
 * missing one.
 */

const TRIM_RIGHT = /[.,;:!?。、，；：！？…—>'">）》\]]+$/

/**
 * A DOI's tail may be almost any printable character, but CJK punctuation is
 * never part of one — and Chinese prose frequently runs straight into the
 * identifier with no separating space, so those must be excluded up front
 * rather than trimmed afterwards.
 */
const CJK_PUNCT = '。、，；：！？（）【】《》〈〉…—～·'

function trimRight(s) {
  let out = s
  for (;;) {
    const next = out.replace(TRIM_RIGHT, '')
    // Only drop a closing bracket when it is unmatched inside the remainder.
    const last = next[next.length - 1]
    if ((last === ')' || last === ']' || last === '}' || last === '）' || last === '】') && !next.slice(0, -1).includes(last === ')' ? '(' : last === ']' ? '[' : last === '}' ? '{' : last === '）' ? '（' : '【')) {
      out = next
      continue
    }
    if (next === out) return next
    out = next
  }
}

const DOI_TAIL = `[^\\s"'<>\`|${CJK_PUNCT}]+`
const DOI_CORE = new RegExp(`10\\.\\d{4,9}\\/${DOI_TAIL}`, 'gi')

/** DOIs may appear bare, as `doi:…`, or inside a resolver URL. */
const DOI_HINT = new RegExp(`(?:https?:\\/\\/)?(?:dx\\.)?doi\\.org\\/(10\\.\\d{4,9}\\/${DOI_TAIL})`, 'gi')
const DOI_LABEL = new RegExp(`\\bDOI\\s*[:：]\\s*(10\\.\\d{4,9}\\/${DOI_TAIL})`, 'gi')

const ARXIV_NEW = /\barXiv\s*[:. ]?\s*(\d{4}\.\d{4,5})(v\d+)?\b/gi
const ARXIV_OLD = /\barXiv\s*[:. ]?\s*([a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7})(v\d+)?\b/gi
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi
const ARXIV_URL = /arxiv\.org\/(?:abs|pdf)\/([^\s"'?#>]+?)(?:\.pdf)?(?=[\s"'?#>()]|$)/gi

const PMID = /\bPMID\s*[:：]?\s*(\d{1,8})\b/gi

const ISBN = /\bISBN(?:-1[03])?\s*[:：]?\s*((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])\b/gi

/** Quoted runs long enough to plausibly be a title. Chinese and Latin quotes. */
const QUOTED = /[“"「『]([^”"」』\n]{12,300})[”"」』]/g
const QUOTED_FALLBACK = /[‘'《]([^’'》\n]{12,300})[’'》]/g

function push(list, seen, entry) {
  const dedupeKey = `${entry.kind}:${entry.value.toLowerCase()}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)
  list.push(entry)
}

/**
 * @param {string} text
 * @param {{includeTitles?: boolean}} [options]
 * @returns {Array<{kind:string, value:string, display:string, index:number, confidence:number}>}
 */
export function extractIdentifiers(text, options = {}) {
  const src = typeof text === 'string' ? text : ''
  if (!src.trim()) return []

  const out = []
  const seen = new Set()

  // Strip markdown link targets so `[Foo](https://doi.org/10.x/y)` yields one
  // hit rather than two.
  const linkTargets = []
  src.replace(/\]\(([^)\s]+)\)/g, (m, url) => {
    linkTargets.push(url)
    return m
  })

  const scan = (source, offset = 0, confidenceBonus = 0) => {
    let m

    DOI_HINT.lastIndex = 0
    while ((m = DOI_HINT.exec(source)) !== null) {
      push(out, seen, {
        kind: 'doi',
        value: trimRight(m[1]),
        display: trimRight(m[1]),
        index: offset + m.index,
        confidence: 0.98 + confidenceBonus,
      })
    }

    DOI_LABEL.lastIndex = 0
    while ((m = DOI_LABEL.exec(source)) !== null) {
      push(out, seen, {
        kind: 'doi',
        value: trimRight(m[1]),
        display: trimRight(m[1]),
        index: offset + m.index,
        confidence: 0.98 + confidenceBonus,
      })
    }

    DOI_CORE.lastIndex = 0
    while ((m = DOI_CORE.exec(source)) !== null) {
      push(out, seen, {
        kind: 'doi',
        value: trimRight(m[0]),
        display: trimRight(m[0]),
        index: offset + m.index,
        // A bare DOI in prose is still very likely real, just slightly riskier.
        confidence: 0.9 + confidenceBonus,
      })
    }

    ARXIV_URL.lastIndex = 0
    while ((m = ARXIV_URL.exec(source)) !== null) {
      push(out, seen, {
        kind: 'arxiv',
        value: trimRight(m[1]).replace(/\.pdf$/i, ''),
        display: trimRight(m[1]).replace(/\.pdf$/i, ''),
        index: offset + m.index,
        confidence: 0.97 + confidenceBonus,
      })
    }

    ARXIV_NEW.lastIndex = 0
    while ((m = ARXIV_NEW.exec(source)) !== null) {
      push(out, seen, {
        kind: 'arxiv',
        value: m[1] + (m[2] ?? ''),
        display: m[1] + (m[2] ?? ''),
        index: offset + m.index,
        confidence: 0.95 + confidenceBonus,
      })
    }

    ARXIV_OLD.lastIndex = 0
    while ((m = ARXIV_OLD.exec(source)) !== null) {
      push(out, seen, {
        kind: 'arxiv',
        value: m[1] + (m[2] ?? ''),
        display: m[1] + (m[2] ?? ''),
        index: offset + m.index,
        confidence: 0.95 + confidenceBonus,
      })
    }

    PMID.lastIndex = 0
    while ((m = PMID.exec(source)) !== null) {
      push(out, seen, { kind: 'pmid', value: m[1], display: m[1], index: offset + m.index, confidence: 0.9 + confidenceBonus })
    }

    ISBN.lastIndex = 0
    while ((m = ISBN.exec(source)) !== null) {
      push(out, seen, { kind: 'isbn', value: m[1].replace(/[-\s]/g, ''), display: m[1], index: offset + m.index, confidence: 0.85 + confidenceBonus })
    }    // Generic URLs: any http(s) link that is not already a DOI/arXiv resolver.
    URL_RE.lastIndex = 0
    while ((m = URL_RE.exec(source)) !== null) {
      const raw = trimRight(m[0])
      if (/doi\.org|arxiv\.org|dx\.doi/i.test(raw)) continue
      push(out, seen, { kind: 'url', value: raw, display: raw, index: offset + m.index, confidence: 0.9 + confidenceBonus })
    }
  }

  scan(src)

  for (const url of linkTargets) scan(url, 0, 0.02)

  if (options.includeTitles !== false) {
    for (const re of [QUOTED, QUOTED_FALLBACK]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(src)) !== null) {
        const value = m[1].trim()
        // A title that is nothing but an identifier adds nothing.
        if (/^10\.\d{4,9}\//.test(value)) continue
        if (!/[一-龥A-Za-z]/.test(value)) continue
        push(out, seen, { kind: 'title', value, display: value, index: m.index, confidence: 0.45 })
      }
    }
  }

  return out.sort((a, b) => a.index - b.index)
}

export { trimRight }
