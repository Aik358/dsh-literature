import { ensureDirs } from './config.js'
import * as store from './store/db.js'
import * as sse from './sse.js'
import { registerRoutes } from './routes.js'
import { registerTools } from './tools.js'
import { registerSessionHook } from './session-hook.js'
import { createActivation, detectIntent } from './activation.js'
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

    // Conditional activation: tools are NOT registered by default. They mount
    // when the user opens the panel or sends a literature-flavoured message,
    // and retire after the idle timeout — so a coding session never carries
    // seven literature tool schemas in its context.
    const activation = createActivation()
    const toolsCtl = registerTools(ctx)
    disposers.push(activation.onTransition(({ active }) => (active ? toolsCtl.mount() : toolsCtl.unmount())))
    disposers.push(() => activation.dispose())

    disposers.push(...registerRoutes(ctx, { activation }))
    try {
      disposers.push(...registerSessionHook(ctx, { activation, detectIntent }))
    } catch (e) {
      error('session hook unavailable:', e.message)
    }
    disposers.push(sse.startHeartbeat())
    try {
      const { startWatcher } = await import('./importer.js')
      disposers.push(startWatcher())
    } catch (e) {
      error('folder watcher unavailable:', e.message)
    }

    // DSH Doctor supervisor self-heal: the host's own schtasks deployment
    // fails when the user path contains spaces, which leaves the web UI
    // spinning on /api/doctor/status forever. Spawn the supervisor under the
    // host process so it lives exactly as long as the host does.
    const doctorTimer = setTimeout(() => {
      import('./doctor-selfheal.js')
        .then(({ ensureDoctorSupervisor }) => ensureDoctorSupervisor())
        .catch((e) => error('doctor supervisor heal unavailable:', e.message))
    }, 5000)
    doctorTimer.unref?.()
    disposers.push(() => clearTimeout(doctorTimer))

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
