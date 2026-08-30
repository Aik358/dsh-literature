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
const { Panel, SidebarButton } = require('./panel.cjs')
const { SettingsPage } = require('./settings.cjs')

function apply(ctx) {
  ctx.effect(() => {
    ensureStyle()
    return () => removeStyle()
  }, 'dsh-literature: styles')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-literature: dictionaries')

  const slots = ctx.slots
  if (!slots) {
    console.warn('[dsh-literature] slots service unavailable — side panel disabled')
    return
  }

  const syncLocale = () => setLocale(detectLocale(ctx) || 'zh')
  syncLocale()
  ctx.on('locale/change', syncLocale)

  // Entry button in the sidebar footer.
  ctx.effect(
    () =>
      slots.inject('sidebar.footer.action', () =>
        slots.register(
          { name: 'sidebar.footer.action', id: 'dsh-literature', order: 6, label: t('entry'), locale: NS },
          (props) => h(SidebarButton, { wide: props && props.wide }),
        ),
      ),
    'dsh-literature: sidebar entry',
  )

  // The floating panel itself.
  ctx.effect(
    () =>
      slots.inject('shell.overlay', () =>
        slots.register({ name: 'shell.overlay', id: 'dsh-literature', order: 7, locale: NS }, () =>
          h(Panel, { onClose: () => store.closePanel() }),
        ),
      ),
    'dsh-literature: overlay panel',
  )

  // A page under Settings, next to the other plugin pages.
  ctx.effect(
    () =>
      slots.inject('settings.section', () =>
        slots.register({ name: 'settings.section', id: 'dsh-literature', order: 30, label: 'Zotero', locale: NS }, (props) =>
          h(SettingsPage, { close: props && props.close }),
        ),
      ),
    'dsh-literature: settings page',
  )

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
