/**
 * Conditional activation.
 *
 * The literature tools are NOT registered by default. Two thirds of a coding
 * session has nothing to do with papers, and a permanently-visible tool list
 * both costs context and invites the model to reach for them unprompted.
 * So the plugin stays silent until one of two signals arrives:
 *
 *   1. the user opens the library panel (browser → /activate), or
 *   2. the user sends a message with clear literature intent ("帮我在网上搜集
 *      文献", "准备组会", "这篇论文的结论是…")
 *
 * Once active the tools stay mounted for a while, then retire on an idle
 * timeout. Detection is deliberately conservative: a false positive interrupts
 * someone who is writing code, which costs far more than a missed activation.
 */

const IDLE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Strong signals — any single hit activates. These are words that essentially
 * never appear in ordinary software work.
 */
const STRONG = [
  '文献', '论文', '参考文献', '引用格式', '引文', '综述', '开题', '组会',
  'doi', 'arxiv', 'pmid', 'isbn', 'bibtex', 'apa', 'mla', 'chicago', 'gb/t 7714', 'gbt7714',
  'abstract', 'citation', 'reference list', 'related work', 'literature review',
  'paper', 'preprint', 'thesis', ' dissertation',
]

/**
 * Weak signals — need a companion academic word. "帮我搜集一些资料" alone is
 * ambiguous (could be about datasets, logs, anything).
 */
const WEAK = ['搜集', '收集', '检索', '查阅', '整理', '准备', '调研', '查一下', '找几篇', 'search', 'collect', 'gather', 'find some']

const ACADEMIC_COMPANION = [
  '文献', '论文', '资料', '研究', '学术', '期刊', '会议', '实验', '方法', '结论',
  'research', 'study', 'studies', 'academic', 'journal', 'conference', 'survey',
]

/**
 * Hard negatives — if the message is clearly coding work, never activate even
 * when an academic word appears (e.g. "fix the paper-size constant in the PDF
 * renderer" or "update the citation parser unit test").
 */
const NEGATIVE = [
  '报错', '崩溃', '编译', '构建', '部署', '单元测试', 'commit', 'merge', '重构', 'debug',
  'stack trace', 'segfault', 'npm ', 'pnpm ', 'yarn ', 'git ', 'build failed', 'regression',
]

function normalize(text) {
  return String(text ?? '').toLowerCase()
}

function hitCount(text, list) {
  let n = 0
  for (const w of list) if (text.includes(w)) n += 1
  return n
}

/**
 * @returns {{ active: boolean, score: number, reason: string }}
 */
export function detectIntent(text) {
  const t = normalize(text)
  if (!t || t.length < 6) return { active: false, score: 0, reason: 'empty' }

  const strong = hitCount(t, STRONG)
  if (strong > 0) {
    // A coding-dominant message wins over a stray academic word.
    const neg = hitCount(t, NEGATIVE)
    if (neg > 0 && neg >= strong) return { active: false, score: 0, reason: 'coding-context' }
    return { active: true, score: 1, reason: 'strong-signal' }
  }

  const weak = hitCount(t, WEAK)
  if (weak > 0 && hitCount(t, ACADEMIC_COMPANION) > 0) {
    return { active: true, score: 0.6, reason: 'weak+academic' }
  }
  return { active: false, score: 0, reason: 'no-signal' }
}

/**
 * Tracks whether the tool surface should be mounted, and notifies listeners
 * on transitions so the caller can register / dispose the tools.
 */
export function createActivation({ idleTimeoutMs = IDLE_TIMEOUT_MS } = {}) {
  const listeners = new Set()
  let active = false
  let reason = ''
  let timer = null
  let lastActivityAt = 0

  function emit(next) {
    active = next
    for (const fn of listeners) {
      try {
        fn({ active, reason })
      } catch {
        /* listener gone */
      }
    }
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function armIdle() {
    clearTimer()
    timer = setTimeout(() => {
      if (!active) return
      reason = 'idle-timeout'
      emit(false)
    }, idleTimeoutMs)
    // Never hold the host process open just for this timer.
    timer.unref?.()
  }

  return {
    /** Mount the tools. Safe to call repeatedly — it just refreshes the idle timer. */
    activate(why = 'manual') {
      lastActivityAt = Date.now()
      if (!active) {
        reason = why
        emit(true)
      }
      armIdle()
    },
    deactivate(why = 'manual') {
      clearTimer()
      if (active) {
        reason = why
        emit(false)
      }
    },
    onTransition(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    isActive: () => active,
    reason: () => reason,
    lastActivityAt: () => lastActivityAt,
    dispose() {
      clearTimer()
      listeners.clear()
    },
  }
}
