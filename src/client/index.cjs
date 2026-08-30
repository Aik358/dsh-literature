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

const { NS, zh, en, t, setLocale, detectLocale } = require('./i18n.cjs')
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
 */
function hasBetterSidebar(ctx) {
  try {
    return !!ctx.betterSidebar
  } catch {
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

function registerBetterSidebarTab(ctx) {
  return () =>
    ctx.betterSidebar.registerTab({
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
    })
}

function apply(ctx) {
  ctx.effect(() => {
    ensureStyle()
    return () => removeStyle()
  }, 'dsh-literature: styles')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-literature: dictionaries')

  // Resolve the slots service FIRST — every registration below reads it, and
  // an effect body runs immediately, so referencing `slots` before its `const`
  // initializes would throw a TDZ ReferenceError at load time.
  const slots = ctx.slots
  if (!slots) {
    console.warn('[dsh-literature] slots service unavailable — side panel disabled')
    return
  }

  const syncLocale = () => setLocale(detectLocale(ctx) || 'zh')
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
   * well after us, so presence is re-checked on a poll: the moment its
   * `ctx.betterSidebar` service shows up we migrate the footer entry into a
   * right-sidebar tab and release the footer slot, keeping the DSH sidebar
   * footer uncluttered.
   */
  const mode = store.getSnapshot().config?.entryMode ?? 'auto'
  const preferBsb = mode !== 'footer'
  let entryDisposer = null
  let migrated = false

  const mountTab = () => {
    if (migrated) return
    migrated = true
    try {
      if (typeof entryDisposer === 'function') entryDisposer()
    } catch (e) {
      console.warn('[dsh-literature] footer entry release failed', e?.message)
    }
    ctx.effect(registerBetterSidebarTab(ctx), 'dsh-literature: better-sidebar tab')
    console.log('[dsh-literature] entry mounted as better-sidebar tab')
  }

  const mountFooter = () => {
    entryDisposer = ctx.effect(registerFooterEntry(slots), 'dsh-literature: sidebar entry')
    ctx.effect(panelSurface, 'dsh-literature: overlay panel')
  }

  if (mode === 'hide') {
    // No footer entry, no tab: access via the Settings page only.
  } else if (preferBsb && hasBetterSidebar(ctx)) {
    mountTab()
  } else if (mode === 'footer') {
    mountFooter()
  } else {
    // auto + not present yet: footer now, migrate when better-sidebar appears.
    mountFooter()
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (!migrated && hasBetterSidebar(ctx)) {
        clearInterval(timer)
        mountTab()
        return
      }
      if (Date.now() - startedAt > 12000) clearInterval(timer)
    }, 400)
    ctx.effect(() => () => clearInterval(timer), 'dsh-literature: bsb poll')
  }

  // SSE progress stream; disposed together with the fiber.
  const disposeEvents = store.attachEvents()
  ctx.effect(() => disposeEvents, 'dsh-literature: sse')

  store.refresh().catch((e) => console.warn('[dsh-literature] initial state load failed', e?.message))
  console.log('[dsh-literature] client ready')
}

// Cordis service dependencies — distinct from `dsh.client.inject` in
// package.json, which is load-order metadata, not a dependency list.
exports.inject = ['slots', 'locale']
exports.apply = apply
