/**
 * dsh-literature — browser half.
 *
 * Build output is a lazy-CJS bundle: `build.mjs` wraps this module in
 * `window.__ModuleLoader__.load({ id, factory })` and the `factory`'s
 * `require` resolves `react`, `@deepseek-ai/cordis`, `…ui-slots` and
 * `…ui-primitives` to the host's own instances. Everything else is bundled.
 */

const React = require('react')
const h = React.createElement

const { NS, zh, en, t, setHostLocale, detectLocale } = require('./i18n.cjs')
const { ensureStyle, removeStyle } = require('./style.cjs')
const store = require('./store.cjs')
const { Panel, SidebarButton, LibraryTab } = require('./panel.cjs')
const { SettingsPage } = require('./settings.cjs')
const { Icon } = require('./ui.cjs')

/**
 * dsh-better-sidebar publishes its registry as `ctx.betterSidebar`. When it is
 * active we contribute a dedicated right-sidebar tab instead of crowding the
 * DSH sidebar footer with yet another button — the footer entry is only used
 * as the no-better-sidebar fallback.
 *
 * The client context is a service proxy whose exact read behaviour differs
 * between the host and the browser runtime (the node-side `reflect.get`
 * returns undefined for a missing service, but the browser face may throw or
 * return a lazily-resolved proxy). So presence is probed through several
 * access paths, and — the decisive test — a probe only counts when actually
 * calling `registerTab` succeeds.
 */
function probeBetterSidebar(ctx) {
  const candidates = []
  try {
    if (ctx.betterSidebar) candidates.push(ctx.betterSidebar)
  } catch (e) {
    console.debug('[dsh-literature] ctx.betterSidebar read threw:', e?.message)
  }
  try {
    const v = ctx.reflect?.get?.('betterSidebar', false) ?? ctx.reflect?.get?.('betterSidebar')
    if (v) candidates.push(v)
  } catch (e) {
    console.debug('[dsh-literature] reflect.get threw:', e?.message)
  }
  try {
    const v = ctx.get?.('betterSidebar')
    if (v) candidates.push(v)
  } catch (e) {
    console.debug('[dsh-literature] ctx.get threw:', e?.message)
  }
  return candidates[0] ?? null
}

/** Attempts to mount the tab; returns true only when the service really works. */
function tryMountBetterSidebarTab(ctx) {
  try {
    const bsb = probeBetterSidebar(ctx)
    if (!bsb || typeof bsb.registerTab !== 'function') return false
    ctx.effect(() => bsb.registerTab(betterSidebarTabDescriptor()), 'dsh-literature: better-sidebar tab')
    console.log('[dsh-literature] better-sidebar tab mounted')
    return true
  } catch (e) {
    console.warn('[dsh-literature] better-sidebar tab mount failed:', e?.message)
    return false
  }
}

function registerFooterEntry(slots) {
  return () =>
    slots.inject('sidebar.footer.action', () =>
      slots.register(
        { name: 'sidebar.footer.action', id: 'dsh-literature', order: 6, label: t('entry'), locale: NS },
        (props) => h(SidebarButton, { wide: props && props.wide }),
      ),
    )
}

function betterSidebarTabDescriptor() {
  return {
    id: 'dsh-literature:library',
    title: () => t('entry'),
    icon: (size) => h(Icon.Panel, { size: size ?? 16 }),
    single: true,
    order: 30,
    component: (props) => h(LibraryTab, props),
    settings: {
      pluginToggles: [
        {
          key: 'autoScanSession',
          title: () => t('settings.autoScan'),
          desc: () => t('settings.autoScanHint'),
          type: 'switch',
        },
        {
          key: 'autoResolve',
          title: () => t('settings.autoResolve'),
          desc: () => t('settings.autoResolveHint'),
          type: 'switch',
        },
      ],
    },
  }
}

function registerBetterSidebarTab(ctx) {
  return () => ctx.betterSidebar.registerTab(betterSidebarTabDescriptor())
}

function apply(ctx) {
  ctx.effect(() => {
    ensureStyle()
    return () => removeStyle()
  }, 'dsh-literature: styles')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-literature: dictionaries')

  // Reader AI-assist lands in whatever chat the user is looking at; the
  // sessions service exposes the current session id through its list snapshot.
  try {
    const sessions = ctx.sessions?.list
    if (sessions) store.setSessionReader(() => sessions.getSnapshot()?.current ?? null)
  } catch (e) {
    console.debug('[dsh-literature] sessions service unavailable:', e?.message)
  }

  // Resolve the slots service FIRST — every registration below reads it, and
  // an effect body runs immediately, so referencing `slots` before its `const`
  // initializes would throw a TDZ ReferenceError at load time.
  const slots = ctx.slots
  if (!slots) {
    console.warn('[dsh-literature] slots service unavailable — side panel disabled')
    return
  }

  // The host language is only an *input*. When the user has pinned a language
  // on the settings page, that preference wins over whatever the host reports.
  const syncLocale = () => setHostLocale(detectLocale(ctx))
  syncLocale()
  ctx.on('locale/change', syncLocale)

  // The library panel itself. In the footer-entry mode it is a floating
  // window; as a better-sidebar tab it is embedded and filled by the host.
  const panelSurface = () =>
    slots.inject('shell.overlay', () =>
      slots.register({ name: 'shell.overlay', id: 'dsh-literature', order: 7, locale: NS }, () =>
        h(Panel, { onClose: () => store.closePanel() }),
      ),
    )

  // Settings page under the host's Settings section.
  ctx.effect(
    () =>
      slots.inject('settings.section', () =>
        slots.register({ name: 'settings.section', id: 'dsh-literature', order: 30, label: 'Literature', locale: NS }, (props) =>
          h(SettingsPage, { close: props && props.close }),
        ),
      ),
    'dsh-literature: settings page',
  )

  /**
   * Entry placement.
   *
   * `better-sidebar` is a heavy client bundle that can materialize and apply
   * well after us, so presence is re-checked on a poll — and the poll's probe
   * is the mount itself (a tab only counts once `registerTab` succeeded).
   * The moment it lands we migrate the footer entry into a right-sidebar tab
   * and release the footer slot, keeping the DSH sidebar footer uncluttered.
   */
  const mode = store.getSnapshot().config?.entryMode ?? 'auto'
  const preferBsb = mode !== 'footer'
  let entryDisposer = null
  let migrated = false

  const mountTab = () => {
    if (migrated) return
    // The probe IS the mount: only a successful registerTab counts.
    if (!tryMountBetterSidebarTab(ctx)) return
    migrated = true
    try {
      if (typeof entryDisposer === 'function') entryDisposer()
    } catch (e) {
      console.warn('[dsh-literature] footer entry release failed', e?.message)
    }
    console.log('[dsh-literature] entry migrated to better-sidebar tab')
  }

  const mountFooter = () => {
    entryDisposer = ctx.effect(registerFooterEntry(slots), 'dsh-literature: sidebar entry')
    ctx.effect(panelSurface, 'dsh-literature: overlay panel')
  }

  if (mode === 'hide') {
    // No footer entry, no tab: access via the Settings page only.
  } else if (preferBsb && tryMountBetterSidebarTab(ctx)) {
    migrated = true
    console.log('[dsh-literature] entry mounted as better-sidebar tab')
  } else if (mode === 'footer') {
    mountFooter()
  } else {
    // auto + not present yet: footer now, migrate when better-sidebar appears.
    mountFooter()
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (migrated) {
        clearInterval(timer)
        return
      }
      mountTab()
      if (Date.now() - startedAt > 30000) clearInterval(timer)
    }, 200)
    ctx.effect(() => () => clearInterval(timer), 'dsh-literature: bsb poll')

    // Some runtimes notify service provision; subscribe when the event exists.
    try {
      ctx.effect(() => {
        const off = ctx.on('internal/service', (name) => {
          if (name === 'betterSidebar' && !migrated) mountTab()
        })
        return typeof off === 'function' ? off : () => {}
      }, 'dsh-literature: bsb service hook')
    } catch {
      /* event not supported on this runtime */
    }
  }

  // NOTE: the SSE progress stream is deliberately NOT connected here. It is
  // ref-counted by the Panel component (connected while the panel is visible,
  // released when it closes / the tab is hidden). An unconditional
  // ensureEvents() at apply time leaked one same-origin connection for the
  // whole session — with the browser's ~6-connection cap that queued every
  // PDF fetch behind it.

  store.refresh().catch((e) => console.warn('[dsh-literature] initial state load failed', e?.message))
  console.log('[dsh-literature] client ready')
}

// Cordis service dependencies — distinct from `dsh.client.inject` in
// package.json, which is load-order metadata, not a dependency list.
exports.inject = ['slots', 'locale']
exports.apply = apply