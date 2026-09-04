/**
 * In-library keyword search.
 *
 * Semantic search (E5 embeddings, see SCENARIO-PLAN §2.0) is the destination,
 * but the keyword path ships first: it is dependency-free, instant, and it is
 * the fallback the semantic engine degrades to when model assets are missing —
 * so it has to exist either way.
 *
 * Tokenisation is the only interesting part: Latin text splits on word
 * boundaries, CJK has none, so Chinese is indexed as unigrams AND bigrams
 * ("脑机" -> 脑, 机, 脑机) which is what makes short queries match at all.
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/

export function tokenize(text) {
  const s = String(text ?? '').toLowerCase()
  const out = new Set()
  for (const m of s.matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
    if (m[0].length >= 2) out.add(m[0])
  }
  const cjkRuns = s.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]+/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length; i += 1) {
      out.add(run[i])
      if (i + 1 < run.length) out.add(run.slice(i, i + 2))
    }
  }
  return [...out]
}

function hasCjk(text) {
  return CJK.test(String(text ?? ''))
}

const WEIGHTS = {
  title: 3,
  authors: 2,
  container: 2,
  abstract: 1,
  tags: 1,
}

function fieldText(item, field) {
  const rec = item.record ?? {}
  switch (field) {
    case 'title':
      return rec.title ?? item.title ?? item.display ?? ''
    case 'authors':
      return (rec.authors ?? []).map((a) => `${a.lastName ?? ''} ${a.firstName ?? ''}`.trim()).join(' ')
    case 'container':
      return rec.container ?? ''
    case 'abstract':
      return rec.abstract ?? ''
    case 'tags':
      return (item.tags ?? []).join(' ')
    default:
      return ''
  }
}

/**
 * @param {Array} items entries from store.listItems()
 * @param {string} query
 * @param {{ limit?: number }} opts
 * @returns {Array<{ key, title, authors, year, container, snippet, score }>}
 */
export function searchItems(items, query, { limit = 20 } = {}) {
  const terms = tokenize(query)
  if (!terms.length) return []

  const scored = []
  for (const item of items) {
    let score = 0
    let matched = false
    for (const [field, weight] of Object.entries(WEIGHTS)) {
      const text = String(fieldText(item, field)).toLowerCase()
      if (!text) continue
      for (const t of terms) {
        if (text.includes(t)) {
          matched = true
          // A CJK unigram matches almost everything; bigrams are the real
          // signal, so longer terms contribute more.
          score += weight * (t.length >= 2 ? 2 : 1)
        }
      }
    }
    if (!matched) continue
    const rec = item.record ?? {}
    scored.push({
      key: item.key,
      title: rec.title ?? item.title ?? item.display ?? '(无标题)',
      authors: (rec.authors ?? []).slice(0, 3).map((a) => a.lastName ?? '').filter(Boolean).join(', '),
      year: rec.year ?? item.year ?? null,
      container: rec.container ?? '',
      snippet: snippetFor(item, terms),
      state: item.state ?? '',
      score,
    })
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.key < b.key ? -1 : 1))
  return scored.slice(0, Math.max(1, Math.min(limit, 50)))
}

/** A short excerpt around the first matching term, or the abstract's head. */
function snippetFor(item, terms) {
  const rec = item.record ?? {}
  const source = rec.abstract || rec.title || ''
  if (!source) return ''
  const lower = source.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return String(source).slice(0, 160)
  const start = Math.max(0, at - 60)
  const head = start > 0 ? '…' : ''
  return head + String(source).slice(start, start + 220).trim()
}

export { hasCjk }
