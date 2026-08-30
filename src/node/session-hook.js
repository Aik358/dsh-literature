import { extractIdentifiers } from './extract/identifiers.js'
import * as pipeline from './pipeline.js'
import { loadConfig } from './config.js'
import { log, warn } from './log.js'

/**
 * Fallback trigger: watch committed session events for identifiers in model
 * output. This exists because a user can paste a DOI into the conversation
 * without the model ever calling `zotero_lookup`. It is off by default —
 * scanning prose turns every citation into a candidate entry, including ones
 * the model merely mentioned.
 */

function blockText(block) {
  if (block == null) return ''
  if (typeof block === 'string') return block
  if (typeof block.text === 'string') return block.text
  if (typeof block.content === 'string') return block.content
  if (Array.isArray(block.content)) return block.content.map(blockText).join('\n')
  return ''
}

function messageText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.map(blockText).join('\n')
  if (Array.isArray(message.content)) return message.content.map(blockText).join('\n')
  if (typeof message.content === 'string') return message.content
  if (typeof message.text === 'string') return message.text
  return ''
}

/** Pulls the assistant's visible text out of a `session/event` payload. */
export function textFromSessionEvent(event) {
  if (!event || typeof event !== 'object') return ''
  const type = event.type
  const data = event.data ?? {}

  if (type === 'assistant/message') return messageText(data.message)
  if (type === 'user/message') return messageText(data.message)
  if (type === 'tool/result') {
    const result = data.result ?? data
    return typeof result === 'string' ? result : blockText(result)
  }
  return ''
}

export function registerSessionHook(ctx) {
  const disposers = []

  disposers.push(
    ctx.on('session/event', (session, event) => {
      const text = textFromSessionEvent(event)
      if (!text || text.length < 20) return
      if (!extractIdentifiers(text).length) return
      // Fire-and-forget: the panel hears about new entries over SSE.
      checkConfig().then((config) => {
        if (!config?.autoScanSession) return
        return pipeline.scanText(text)
      }).catch((e) => warn('session scan failed:', e.message))
    }),
  )

  log('session hook registered (autoScanSession gates it)')
  return disposers
}

let cachedConfig = null
let cachedAt = 0

/** Config lives on disk; refresh it at most every couple of seconds. */
async function checkConfig() {
  const now = Date.now()
  if (cachedConfig && now - cachedAt < 2000) return cachedConfig
  cachedAt = now
  cachedConfig = await loadConfig()
  return cachedConfig
}
