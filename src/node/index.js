import { ensureDirs } from './config.js'
import * as store from './store/db.js'
import * as sse from './sse.js'
import { registerRoutes } from './routes.js'
import { registerTools } from './tools.js'
import { registerSessionHook } from './session-hook.js'
import { error, log } from './log.js'

export const name = 'dsh-literature-pre'

/**
 * Cordis service dependencies. `webServer` gives us loopback-only HTTP routes
 * (including the SSE stream), `tools` lets the model trigger lookups and saves
 * directly instead of us guessing from reply text.
 */
export const inject = ['webServer', 'tools']

export function apply(ctx, config) {
  // The plugin runs inside the same process as the whole `dsh web` server. A
  // throw that escapes a route handler would otherwise take the host with it.
  const onUncaught = (e) => error('uncaught exception:', e?.stack ?? e)
  const onUnhandled = (e) => error('unhandled rejection:', e?.stack ?? e)
  process.on('uncaughtException', onUncaught)
  process.on('unhandledRejection', onUnhandled)

  const disposers = []

  ctx.effect(() => {
    ensureDirs()
      .then(() => store.init())
      .catch((e) => error('storage init failed:', e.message))
  }, 'dsh-literature: storage')

  const ready = (async () => {
    await ensureDirs()
    await store.init()
    disposers.push(...registerRoutes(ctx))
    disposers.push(...registerTools(ctx))
    try {
      disposers.push(...registerSessionHook(ctx))
    } catch (e) {
      error('session hook unavailable:', e.message)
    }
    disposers.push(sse.startHeartbeat())
    log('dsh-literature host half ready')
  })().catch((e) => error('dsh-literature startup failed:', e?.stack ?? e))

  return () => {
    ready.catch(() => {})
    for (const d of disposers.splice(0)) {
      try {
        d?.()
      } catch (e) {
        error('dispose failed:', e.message)
      }
    }
    process.off('uncaughtException', onUncaught)
    process.off('unhandledRejection', onUnhandled)
    store.flush().catch(() => {})
    log('dsh-literature host half disposed')
  }
}
