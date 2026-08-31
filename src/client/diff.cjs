const React = require('react')
const h = React.createElement

const store = require('./store.cjs')
const { t } = require('./i18n.cjs')
const { Button, Spinner } = require('./ui.cjs')

/**
 * Conflict preview: the library already contains an entry that looks like the
 * same work, so before saving we show the field-level difference and let the
 * user pick how to proceed. The host computes the diff; the panel only renders.
 */

function row(field, before, after) {
  return h(
    'tr',
    { key: field },
    h('th', null, field),
    h('td', { className: 'del' }, before || '—'),
    h('td', { className: 'add' }, after || '—'),
  )
}

function ConflictDiff({ item, conflict }) {
  const [busy, setBusy] = React.useState(false)

  if (conflict?.error) {
    return h('div', { className: 'zt-diff' }, h('div', { className: 'zt-error' }, conflict.error))
  }

  if (!conflict) {
    return h(
      'div',
      { className: 'zt-diff' },
      h('div', { className: 'zt-empty' }, h(Spinner, { size: 18 }), h('p', null, t('diff.title'))),
    )
  }

  const diff = conflict.diff ?? []
  const proceed = async (mode) => {
    setBusy(true)
    try {
      // The Connector API only creates items — it cannot update or delete, so
      // "overwrite" and "merge" cannot be executed faithfully. Triggering a
      // save here would create a DUPLICATE instead of replacing anything, so
      // we never re-save; we tell the user the honest outcome instead.
      if (mode === 'replace' || mode === 'merge') {
        store.flash(t('diff.notSupported'))
      }
      // 'keep' (and the two unsupported modes) leave the library untouched.
      store.setView('list')
    } finally {
      setBusy(false)
    }
  }

  return h(
    'div',
    { className: 'zt-diff' },
    h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, t('diff.title')),
    h('div', { className: 'zt-hint', style: { marginBottom: 12 } }, t('diff.subtitle')),
    h('div', { className: 'zt-card-id', style: { marginBottom: 12 } }, conflict.key),
    diff.length
      ? h(
          'table',
          null,
          h('thead', null, h('tr', null, h('th', null, '字段'), h('th', null, '库中'), h('th', null, '新条目'))),
          h('tbody', null, ...diff.map((d) => row(d.field, d.before, d.after))),
        )
      : h('div', { className: 'zt-hint', style: { marginBottom: 12 } }, t('diff.noDiff')),
    h('div', { className: 'zt-actions', style: { marginTop: 16 } },
      h(Button, { variant: 'primary', onClick: () => proceed('keep'), disabled: busy }, t('action.keep')),
      h(Button, { onClick: () => proceed('replace'), disabled: busy }, t('action.replace')),
      h(Button, { variant: 'ghost', onClick: () => proceed('merge'), disabled: busy }, t('action.merge')),
      h(Button, { variant: 'ghost', onClick: () => store.setView('list'), disabled: busy }, t('action.cancel')),
    ),
  )
}

module.exports = { ConflictDiff }
