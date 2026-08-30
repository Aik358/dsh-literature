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

  const slots = ctx.slots
  if (!slots) {
    console.warn('[dsh-literature] slots service unavailable — side panel disabled')
    return
  }

  const bsbNow = hasBetterSidebar(ctx)
  if (bsbNow) {
    ctx.effect(registerBetterSidebarTab(ctx), 'dsh-literature: better-sidebar tab')
    console.log('[dsh-literature] better-sidebar detected — entry lives in its right sidebar')
  } else {
    ctx.effect(registerFooterEntry(slots), 'dsh-literature: sidebar entry')
    ctx.effect(panelSurface, 'dsh-literature: overlay panel')

    // The better-sidebar bundle may activate after us (e.g. a different load
    // order). If it shows up within a few seconds, migrate the entry there so
    // the sidebar footer stays uncluttered.
    const timer = setTimeout(() => {
      if (!hasBetterSidebar(ctx)) return
      try {
        ctx.dispose('dsh-literature: sidebar entry')
        ctx.dispose('dsh-literature: overlay panel')
      } catch {
        /* already disposed */
      }
      ctx.effect(registerBetterSidebarTab(ctx), 'dsh-literature: better-sidebar tab')
      console.log('[dsh-literature] better-sidebar appeared late — moved entry to its right sidebar')
    }, 1500)
    ctx.effect(() => () => clearTimeout(timer), 'dsh-literature: bsb migration timer')
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
