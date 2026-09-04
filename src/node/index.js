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
export const inject = ['webServer', 'tools', 'systemPrompt']

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

    // Tools are mounted PERMANENTLY: the user asked for the skill to be
    // selectable any time, not gated behind signals. The activation machinery
    // (panel-open / intent detection) stays wired as a *positive* signal — it
    // refreshes recency tracking and can later drive a context-saving GUIDANCE
    // tier — but it no longer gates the tool surface.
    const activation = createActivation()
    activation.activate('always-on')
    const toolsCtl = registerTools(ctx)
    toolsCtl.mount()
    disposers.push(activation.onTransition(({ active }) => (active ? toolsCtl.mount() : toolsCtl.unmount())))
    disposers.push(() => activation.dispose())

    // Static capability note (byte-stable, prefix-cache safe): tells the model
    // the literature tools exist and when to reach for them. Kept short.
    try {
      disposers.push(
        ctx.systemPrompt.section({
          name: 'dsh:dsh-literature-capabilities',
          order: 9900,
          text: () =>
            [
              '本机已安装文献插件（dsh-literature）：内置文献库 + PDF/课件阅读 + 规范引用生成。',
              '用户提到「文献/论文/DOI/arXiv/引用/参考文献/综述/组会」或需要学术支撑时：',
              '- 找库里已有的 → literature_search（先查再答，不要凭空编造条目）',
              '- 看详情 → literature_get；结构化解读 → literature_deepread（速读/深读/精读三档，产出后用 literature_note 保存）',
              '- 写作引用 → literature_cite（APA/GB/MLA/Chicago/BibTeX，勿手工拼装）',
              '- 记录文献与当前工作的关系 → literature_note；用户明确要求画图时 → literature_figure',
              '纪律：先 search 再 get；未找到时如实说「库里没有」；编码任务中不要主动使用这些工具。',
            ].join('\n'),
        }),
      )
    } catch (e) {
      error('systemPrompt unavailable:', e.message)
    }

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
