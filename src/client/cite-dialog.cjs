/**
 * Citation dialog.
 *
 * Replaces the old one-click copy: clicking a citation menu entry now opens
 * this window where the user previews the reference with REAL italics, picks
 * the style/mode, and copies it themselves — either as plain text or with an
 * HTML clipboard flavor so italics survive pasting into Word / Google Docs.
 *
 * The italics arrive as `segments` (the server marks them with `*…*` and then
 * splits them), NOT as raw HTML injection — nothing from the record is ever
 * passed through dangerouslySetInnerHTML here.
 *
 * Rendered through a PORTAL on document.body (T3): the panel root carries a
 * transform (drag positioning), and a transformed ancestor turns position:fixed
 * into "fixed to that ancestor" — the backdrop would be trapped inside the
 * panel's stacking context and clipped by its overflow, i.e. invisible.
 */

const React = require('react')
const ReactDOM = require('react-dom')
const h = React.createElement
const { useState, useEffect, useRef, useCallback } = React

const store = require('./store.cjs')
const { t } = require('./i18n.cjs')
const { Icon, Spinner, Button, IconButton, copyText, copyRich } = require('./ui.cjs')

const STYLE_TABS = [
  { id: 'apa', label: 'APA 7' },
  { id: 'gb', label: 'GB/T 7714' },
  { id: 'mla', label: 'MLA 9' },
  { id: 'chicago', label: 'Chicago 17' },
  { id: 'bibtex', label: 'BibTeX' },
]

const MODE_TABS = [
  { id: 'reference', label: t('cite.reference') },
  { id: 'intext', label: t('cite.intext') },
  { id: 'direct', label: t('cite.direct') },
]

function CitationDialog({ item, onClose }) {
  const [style, setStyle] = useState('apa')
  const [mode, setMode] = useState('reference')
  const [pages, setPages] = useState('')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  const isBibtex = style === 'bibtex'
  // BibTeX has no in-text / direct semantics; the server forces reference too,
  // but keeping the local state consistent avoids a pointless refetch.
  const effMode = isBibtex ? 'reference' : mode

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    store
      .citeItem(item.key, { style, mode: effMode, pages: effMode === 'direct' ? pagesRef.current : undefined })
      .then((d) => {
        if (alive) setDetail(d)
      })
      .catch((e) => {
        if (alive) setError(e.message ?? String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [item.key, style, effMode, effMode === 'direct' ? pages : ''])

  // Esc closes — same contract as the reader and the context menus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const doCopy = useCallback(
    async (rich) => {
      if (!detail) return
      try {
        if (rich) {
          const ok = await copyRich(detail.html, detail.text)
          setCopied(ok ? 'rich' : 'plain')
        } else {
          await copyText(detail.text)
          setCopied('plain')
        }
        setTimeout(() => setCopied(''), 1600)
      } catch {
        /* clipboard denied — nothing sensible to flash */
      }
    },
    [detail],
  )

  const title = item.record?.title ?? item.title ?? item.display ?? ''

  // Portal to <body>: escape the panel's transform/overflow (see file header).
  return ReactDOM.createPortal(
    h(
    'div',
    {
      className: 'zt-modal-backdrop',
      onMouseDown: (e) => {
        if (e.target === e.currentTarget) onClose()
      },
    },
    h(
      'div',
      { className: 'zt-modal zt-cite-modal', role: 'dialog', 'aria-label': t('cite.title') },
      // Header
      h(
        'div',
        { className: 'zt-row', style: { justifyContent: 'space-between', marginBottom: 10 } },
        h('span', { style: { fontSize: 14, fontWeight: 500 } }, t('cite.title')),
        h(IconButton, { title: t('close'), onClick: onClose }, h(Icon.Close, { size: 16 })),
      ),
      title ? h('div', { className: 'zt-hint', style: { marginBottom: 10 } }, title) : null,

      // Style tabs
      h(
        'div',
        { className: 'zt-tabs', role: 'tablist' },
        STYLE_TABS.map((s) =>
          h(
            'button',
            {
              key: s.id,
              className: 'zt-tab' + (style === s.id ? ' zt-tab-active' : ''),
              role: 'tab',
              'aria-selected': style === s.id,
              onClick: () => setStyle(s.id),
            },
            s.label,
          ),
        ),
      ),

      // Mode tabs (not for BibTeX)
      !isBibtex
        ? h(
            'div',
            { className: 'zt-tabs', style: { marginTop: 6 }, role: 'tablist' },
            MODE_TABS.map((m) =>
              h(
                'button',
                {
                  key: m.id,
                  className: 'zt-tab' + (mode === m.id ? ' zt-tab-active' : ''),
                  role: 'tab',
                  'aria-selected': mode === m.id,
                  onClick: () => setMode(m.id),
                },
                m.label,
              ),
            ),
          )
        : null,

      // Pages input for direct quotes
      effMode === 'direct'
        ? h(
            'div',
            { className: 'zt-row', style: { marginTop: 8, gap: 8 } },
            h('input', {
              className: 'zt-input',
              style: { flex: 1 },
              value: pages,
              placeholder: t('cite.pagesLabel'),
              onChange: (e) => setPages(e.target.value),
            }),
          )
        : null,

      // Preview — segments render REAL italics; nothing raw is injected.
      h(
        'div',
        { className: 'zt-cite-preview', style: { marginTop: 10 } },
        loading
          ? h(Spinner, { size: 18 })
          : error
            ? h('span', { className: 'zt-error', style: { padding: 0 } }, error)
            : detail?.segments?.map((seg, i) =>
                seg.italic ? h('i', { key: i }, seg.text) : h('span', { key: i }, seg.text),
              ),
      ),
      !isBibtex && !loading && !error ? h('div', { className: 'zt-hint', style: { marginTop: 6 } }, t('cite.citeHint')) : null,

      // Actions
      h(
        'div',
        { className: 'zt-row', style: { marginTop: 12, justifyContent: 'flex-end', gap: 8 } },
        copied ? h('span', { className: 'zt-hint' }, t('action.copied', { label: copied === 'rich' ? t('cite.copyRich') : t('cite.copyPlain') })) : null,
        h(Button, { variant: 'ghost', onClick: () => doCopy(false), disabled: loading || !!error }, t('cite.copyPlain')),
        h(Button, { variant: 'primary', onClick: () => doCopy(true), disabled: loading || !!error, title: t('cite.copyRichHint') }, t('cite.copyRich')),
      ),
    ),
    ),
    document.body,
  )
}

module.exports = { CitationDialog }
