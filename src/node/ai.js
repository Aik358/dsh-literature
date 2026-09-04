import * as store from './store/db.js'
import { extractPdfText } from './pdf-text.js'
import { recentSession } from './session-track.js'
import { log } from './log.js'

/**
 * AI assist: turns reader interactions (selected text, full-text questions,
 * TL;DR) into messages steered into the CURRENT DSH conversation, so the
 * model answers right where the user is talking to it — the ChatPDF / SciSpace
 * pattern, without the plugin needing its own LLM endpoint.
 *
 * Wiring: the browser reads `ctx.sessions.list.getSnapshot().current` and
 * passes the session id; the host falls back to the most recently observed
 * session (tracked in the zero-dependency `session-track` module, which the
 * session/event listener updates).
 */

const FULLTEXT_ACTIONS = new Set(['tldr', 'ask'])
const MAX_CONTEXT_CHARS = 60000

function headFor(entry) {
  return `【文献助手 · ${entry.record?.title || entry.title || entry.display || '未命名文献'}】`
}

/**
 * Builds the user-facing prompt that gets steered into the conversation.
 * The text-formatting is deliberate: the model sees the paper title, the
 * selected passage / full-text excerpt, and an explicit instruction.
 */
export function buildPrompt({ title, action, question = '', selection = '', text = '' }) {
  const head = `【文献助手 · ${title}】`
  switch (action) {
    case 'translate':
      return `${head}\n请把下面这段选自该文献的文字翻译成简体中文，保持学术语气，直接给出译文：\n\n"""\n${selection}\n"""`
    case 'explain':
      return `${head}\n请解释下面这段选自该文献的文字：先用一句话概括核心意思，再展开背景与关键概念（如有术语请单独说明）：\n\n"""\n${selection}\n"""`
    case 'summarize':
      return `${head}\n请用 2-4 句话总结下面这段文字的核心内容，并指出它与全文主题的关系：\n\n"""\n${selection}\n"""`
    case 'tldr':
      return `${head}\n请为这篇文献生成结构化中文摘要：研究问题、方法、主要发现、结论（每项 1-2 句），并给出 3-5 个关键词。若提供的全文不完整，请注明。\n\n可用的全文内容：\n"""\n${text}\n"""`
    case 'ask':
    default:
      return `${head}\n请基于这篇文献回答下面的问题。引用原文时请标注大致页码；若提供的全文不足以回答，请明确说明。\n\n用户问题：${question}\n\n可用的全文内容：\n"""\n${text}\n"""`
  }
}

/**
 * Steers an AI-assist message into the target conversation.
 *
 * @param {object} ctx Cordis context (carries `agents`)
 * @param {object} opts
 * @param {string} opts.key library item key
 * @param {'translate'|'explain'|'summarize'|'tldr'|'ask'} [opts.action]
 * @param {string} [opts.question]   full-text question (action 'ask')
 * @param {string} [opts.selection]  selected passage (selection actions)
 * @param {string} [opts.sessionId]  preferred session (from the browser)
 * @returns {Promise<{ok: boolean, sessionId: string, action: string}>}
 */
export async function askAi(ctx, { key, action = 'ask', question = '', selection = '', sessionId = null } = {}) {
  const entry = await store.getItem(String(key ?? ''))
  if (!entry) throw Object.assign(new Error('条目不存在'), { code: 'not_found' })
  if (!['translate', 'explain', 'summarize', 'tldr', 'ask'].includes(action)) action = 'ask'

  const sid = (sessionId && String(sessionId)) || recentSession()
  if (!sid) {
    throw Object.assign(new Error('当前没有活跃对话，请先开始一个对话再试'), { code: 'no_session' })
  }
  const agent = ctx?.agents?.get?.(sid)
  if (!agent || typeof agent.steer !== 'function') {
    throw Object.assign(new Error('当前对话不可用，请刷新后重试'), { code: 'no_session' })
  }

  let text = ''
  if (FULLTEXT_ACTIONS.has(action)) {
    if (!entry.pdf?.path) {
      throw Object.assign(new Error('该条目还没有 PDF 全文'), { code: 'no_pdf' })
    }
    try {
      text = await extractPdfText(entry.pdf.path)
    } catch {
      throw Object.assign(new Error('无法解析该 PDF 的文本（文件可能损坏）'), { code: 'no_text' })
    }
    if (!text) {
      throw Object.assign(new Error('这篇 PDF 没有可提取的文本（可能是扫描件）'), { code: 'no_text' })
    }
    // Keep the injected context bounded — a full paper is far too long to send
    // verbatim; the head of the paper carries the abstract + intro anyway.
    if (text.length > MAX_CONTEXT_CHARS) text = text.slice(0, MAX_CONTEXT_CHARS)
  }

  const prompt = buildPrompt({
    title: entry.record?.title || entry.title || entry.display || '未命名文献',
    action,
    question: String(question ?? '').trim().slice(0, 2000),
    selection: String(selection ?? '').trim().slice(0, 4000),
    text,
  })

  // Lazy: `@deepseek-ai/dsh-llm` only exists inside the DSH runtime — unit
  // tests (which import the host half without the SDK) must never touch it.
  // Outside the runtime we fall back to a structurally equivalent message.
  let message
  try {
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    message = createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })
  } catch {
    message = { content: [{ type: 'text', text: prompt }], source: { kind: 'user' }, role: 'user', id: `lit_${Date.now()}` }
  }
  agent.steer(message)
  log(`ai ask steered (${action}) into session ${sid}`)
  return { ok: true, sessionId: sid, action }
}

/**
 * Steers a figure into the current conversation as text + image blocks.
 *
 * Path (verified against the SDK types): plugin renders PNG bytes (matplotlib
 * via the plugin venv) -> `ctx.attachments.saveImages()` -> ImageAttachmentRef
 * -> createUserMessage({ content: [text, { type:'image', attachment }] }).
 * Honors imageLimits by scaling down oversize rasters before admission.
 */
export async function sendFigure(ctx, { png, caption = '', title = '示意图', sessionId = null } = {}) {
  if (!png || !png.length) throw Object.assign(new Error('没有图片数据'), { code: 'no_image' })
  const sid = (sessionId && String(sessionId)) || recentSession()
  if (!sid) throw Object.assign(new Error('当前没有活跃对话，请先开始一个对话再试'), { code: 'no_session' })
  const agent = ctx?.agents?.get?.(sid)
  if (!agent || typeof agent.steer !== 'function') {
    throw Object.assign(new Error('当前对话不可用，请刷新后重试'), { code: 'no_session' })
  }
  if (!ctx?.attachments?.saveImages) {
    throw Object.assign(new Error('宿主不支持图片附件'), { code: 'no_attachments' })
  }

  // Respect the deployment's image policy: cap bytes and dimensions.
  let bytes = png
  const limits = ctx.attachments.imageLimits ?? {}
  const maxBytes = limits.maxImageBytes ?? 5 * 1024 * 1024
  if (bytes.length > maxBytes) {
    throw Object.assign(new Error(`图片超过宿主大小限制（${bytes.length} > ${maxBytes} 字节）`), { code: 'too_large' })
  }
  const mediaType = limits.mediaTypes?.length ? (limits.mediaTypes.includes('image/png') ? 'image/png' : limits.mediaTypes[0]) : 'image/png'

  const [ref] = await ctx.attachments.saveImages([{ data: new Uint8Array(bytes), mediaType, name: title.slice(0, 60) }])
  if (!ref) throw Object.assign(new Error('图片附件创建失败'), { code: 'no_attachments' })

  const text = `【文献助手 · ${title}】\n${caption || '根据数据生成的示意图。'}\n（图由插件根据原始数据绘制，非原文插图）`
  try {
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
    agent.steer(createUserMessage({ content: [{ type: 'text', text }, { type: 'image', attachment: ref }], source: { kind: 'user' } }))
  } catch {
    agent.steer({ content: [{ type: 'text', text }, { type: 'image', attachment: ref }], source: { kind: 'user' }, role: 'user', id: `lit_fig_${Date.now()}` })
  }
  log(`figure steered into session ${sid}`)
  return { ok: true, sessionId: sid }
}
