const React = require('react')
const h = React.createElement
const { useState, useEffect, useRef, useSyncExternalStore, useCallback } = React

const store = require('./store.cjs')
const { t } = require('./i18n.cjs')
const { Icon, Spinner, Badge, Button, IconButton, EmptyState, ProgressBar } = require('./ui.cjs')
const { api } = require('./api.cjs')
const { createViewer } = require('./pdf/viewer.cjs')
const { SettingsPage } = require('./settings.cjs')
const { ConflictDiff } = require('./diff.cjs')

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

const STATE_TONE = {
  discovered: 'info',
  resolving: 'info',
  resolved: 'info',
  fetching: 'info',
  fetched: 'success',
  saving: 'info',
  saved: 'success',
  save_failed: 'error',
  fetch_failed: 'error',
  resolve_failed: 'error',
  duplicate: 'warn',
}

function metaLine(item) {
  const parts = []
  const authors = item.record?.authors ?? item.authors ?? []
  if (authors.length) {
    const names = authors.map((a) => [a.lastName, a.firstName].filter(Boolean).join(' ')).filter(Boolean)
    parts.push(names.length > 3 ? `${names.slice(0, 3).join('、')} 等` : names.join('、'))
  }
  const year = item.record?.year ?? item.year
  if (year) parts.push(String(year))
  const container = item.record?.container ?? ''
  if (container) parts.push(container)
  return parts.join(' · ')
}

function identifierLine(item) {
  const bits = []
  if (item.doi) bits.push(item.doi)
  if (item.arxiv) bits.push(`arXiv:${item.arxiv}`)
  if (item.isbn) bits.push(`ISBN:${item.isbn}`)
  if (item.pmid) bits.push(`PMID:${item.pmid}`)
  if (!bits.length && item.rawValue) bits.push(item.rawValue)
  return bits.join('  ')
}

function ItemCard({ item }) {
  const busy = store.isBusy(item.key)
  const task = store.getSnapshot().tasks[item.key]
  const error = item.error?.message ?? (item.state.endsWith('_failed') ? t('state.' + item.state) : '')
  const tone = STATE_TONE[item.state] ?? 'info'

  const actions = []
  if (item.state === 'discovered' || item.state === 'resolve_failed') {
    actions.push(h(Button, { key: 'resolve', variant: 'primary', onClick: () => store.resolveItem(item.key), loading: busy }, t('action.retry')))
  } else if (item.state === 'resolved' && !item.pdf) {
    actions.push(h(Button, { key: 'fetch', variant: 'primary', onClick: () => store.fetchPdf(item.key), loading: busy }, t('action.download')))
  } else if (item.state === 'fetch_failed') {
    actions.push(h(Button, { key: 'fetch', variant: 'primary', onClick: () => store.retryItem(item.key), loading: busy }, t('action.retry')))
    if (item.error?.code === 'paywalled') {
      actions.push(
        h(Button, { key: 'open', onClick: () => window.open(item.record?.url || `https://doi.org/${item.doi}`, '_blank') }, t('action.openSource')),
      )
    }
  } else if (item.state === 'fetched') {
    actions.push(h(Button, { key: 'read', variant: 'primary', onClick: () => store.selectItem(item.key, 'reader') }, t('action.read')))
    actions.push(h(Button, { key: 'save', onClick: () => store.saveItem(item.key) }, t('action.save')))
    if (item.saveMode === 'dir') {
      actions.push(h(Button, { key: 'savedir', onClick: () => store.saveItem(item.key, { mode: 'zotero' }) }, t('action.save')))
    }
  } else if (item.state === 'save_failed') {
    actions.push(h(Button, { key: 'retry', variant: 'primary', onClick: () => store.retryItem(item.key), loading: busy }, t('action.retry')))
  } else if (item.state === 'saved') {
    actions.push(h(Button, { key: 'read', variant: 'primary', onClick: () => store.selectItem(item.key, 'reader') }, t('action.read')))
    if (item.zotero?.key) {
      actions.push(
        h(Button, { key: 'zotero', onClick: () => window.open(`zotero://select/library/items/${item.zotero.key}`, '_blank') }, t('action.openInZotero')),
      )
    }
  }

  if (item.state === 'resolved' || item.state === 'fetched' || item.state === 'save_failed') {
    actions.push(h(Button, { key: 'diff', onClick: () => store.showDiff(item.key) }, t('action.diff')))
  }
  actions.push(h(Button, { key: 'discard', variant: 'ghost', onClick: () => store.discardItem(item.key) }, t('action.discard')))

  const title = item.record?.title || item.title || item.display || item.rawValue || 'Untitled'

  return h(
    'div',
    { className: 'zt-card', 'data-state': item.state, onClick: () => item.pdf?.path && store.selectItem(item.key, 'reader') },
    h('div', { className: 'zt-row', style: { justifyContent: 'space-between', marginBottom: 4 } },
      h('div', { className: 'zt-row', style: { minWidth: 0 } },
        h(Badge, { tone }, t('state.' + item.state)),
        item.state === 'duplicate' ? h(Badge, { tone: 'warn' }, t('state.duplicate')) : null,
      ),
      item.state === 'saved' && item.saveMode === 'zotero' ? h(Badge, { tone: 'success' }, '本地库') : item.state === 'saved' ? h(Badge, { tone: 'success' }, 'Dir') : null,
    ),
    h('h4', { className: 'zt-card-title' }, title),
    h('p', { className: 'zt-card-meta' }, metaLine(item)),
    h('div', { className: 'zt-card-id' }, identifierLine(item)),
    task ? h(ProgressBar, { value: task.progress }) : null,
    error ? h('div', { className: 'zt-error' }, error) : null,
    h('div', { className: 'zt-actions' }, ...actions),
  )
}

function ItemList() {
  const state = useStore()
  if (!state.loaded) {
    return h('div', { className: 'zt-list' }, h('div', { className: 'zt-skeleton' }), h('div', { className: 'zt-skeleton' }), h('div', { className: 'zt-skeleton' }))
  }
  if (state.items.length === 0) {
    return h(
      'div',
      { className: 'zt-list' },
      h(EmptyState, { key: 'empty' }),
    )
  }
  return h('div', { className: 'zt-list' }, ...state.items.map((item) => h(ItemCard, { key: item.key, item })))
}

function SearchBar() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      await store.scanText(text)
      setText('')
    } finally {
      setBusy(false)
    }
  }
  return h(
    'div',
    { className: 'zt-toolbar' },
    h('input', {
      className: 'zt-input',
      placeholder: t('empty.placeholder'),
      value: text,
      onChange: (e) => setText(e.target.value),
      onKeyDown: (e) => {
        if (e.key === 'Enter') submit()
      },
    }),
    h(Button, { onClick: submit, loading: busy, disabled: !text.trim() }, t('empty.add')),
  )
}

function PanelHeader({ onClose }) {
  const state = useStore()
  const dragRef = useRef(null)
  const zoteroRunning = state.zotero?.running === true

  const onDragStart = (e) => {
    if (e.target.closest('button')) return
    const startX = e.clientX
    const startY = e.clientY
    const geom = state.geometry
    const startLeft = geom.x ?? null
    const startTop = geom.y ?? null
    const rect = dragRef.current?.getBoundingClientRect()
    const baseLeft = startLeft ?? rect?.left ?? window.innerWidth - (geom.width || 380) - 16
    const baseTop = startTop ?? rect?.top ?? 12

    const move = (ev) => {
      store.setGeometry({ x: Math.max(0, baseLeft + ev.clientX - startX), y: Math.max(0, baseTop + ev.clientY - startY) })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const style = {}
  if (state.geometry.x != null) style.left = state.geometry.x
  if (state.geometry.y != null) style.top = state.geometry.y
  if (state.geometry.x == null && state.geometry.y == null) {
    style.right = 8
  }

  return h(
    'div',
    { className: 'zt-header', ref: dragRef, style, onMouseDown: onDragStart },
    h('div', { className: 'zt-row', style: { gap: 4 } },
      zoteroRunning ? h(Badge, { tone: 'success' }, t('status.running')) : h(Badge, { tone: 'warn' }, t('status.down')),
    ),
    h('span', { className: 'zt-title', title: t('panelTitle') }, t('panelTitle')),
    h(IconButton, { title: t('settingsTooltip'), onClick: () => store.setView(state.view === 'settings' ? 'list' : 'settings') }, h(Icon.Settings, { size: 16 })),
    h(IconButton, { title: t('close'), onClick: onClose }, h(Icon.Close, { size: 16 })),
  )
}

function ResizeHandle({ edge }) {
  const onDown = (e) => {
    e.preventDefault()
    const geom = store.getSnapshot().geometry
    const startX = e.clientX
    const startW = geom.width ?? 380
    const move = (ev) => {
      let width = startW
      if (edge === 'left') width = startW - (ev.clientX - startX)
      if (edge === 'br') width = startW + (ev.clientX - startX)
      store.setGeometry({ width: Math.min(720, Math.max(300, width)) })
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }
  return h('div', { className: edge === 'left' ? 'zt-handle-l' : 'zt-handle-br', onMouseDown: onDown })
}

function Reader({ item }) {
  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const ctrlRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [scale, setScale] = useState(1)
  const [mode, setMode] = useState('fit-width')
  const [tocOpen, setTocOpen] = useState(false)
  const [outline, setOutline] = useState([])
  const [searchQ, setSearchQ] = useState('')
  const [matches, setMatches] = useState([])
  const [annotations, setAnnotations] = useState([])

  const pdfUrl = item.pdf?.path ? api.pdfUrl(item.key) : item.zotero?.key ? api.zoteroPdfUrl(item.zotero.key) : null

  useEffect(() => {
    if (!pdfUrl) return undefined
    let ctrl
    let disposed = false
    ;(async () => {
      try {
        const ann = await api.annotations(item.key).catch(() => ({ annotations: [] }))
        if (disposed) return
        setAnnotations(ann.annotations ?? [])
        ctrl = await createViewer(scrollRef.current, {
          pdfUrl,
          docId: item.key,
          annotations: ann.annotations ?? [],
          mode: 'fit-width',
        })
        if (disposed) {
          ctrl.destroy()
          return
        }
        ctrlRef.current = ctrl
        setReady(true)
        setTotal(ctrl.numPages())
        setOutline(ctrl.outline ?? [])
        setScale(ctrl.getScale())
        ctrl.on('scale', ({ scale: s }) => {
          setScale(s)
          setMode(ctrl.getMode())
        })
        ctrl.on('annotation', (annotation) => {
          api.addAnnotation(item.key, annotation).catch(() => {})
        })
      } catch (e) {
        setError(e?.message ?? String(e))
      }
    })()

    return () => {
      disposed = true
      ctrl?.destroy()
      ctrlRef.current = null
    }
  }, [pdfUrl, item.key])

  const updatePage = useCallback(() => {
    if (!ctrlRef.current) return
    setPage(ctrlRef.current.currentPage())
  }, [])

  const doSearch = async () => {
    const q = searchQ.trim()
    if (!q || !ctrlRef.current) return
    const found = await ctrlRef.current.search(q)
    setMatches(found)
    if (found.length) {
      ctrlRef.current.goToPage(found[0].page)
      ctrlRef.current.highlightMatches(q)
    }
  }

  if (!pdfUrl) {
    return h('div', { className: 'zt-empty' }, h('h4', null, t('reader.notDownloaded')), h('p', null, t('action.download')))
  }

  return h(
    'div',
    { className: 'zt-reader' },
    h(
      'div',
      { className: 'zt-toolbar' },
      h(IconButton, { title: t('back'), onClick: () => store.setView('list') }, h(Icon.Back, { size: 16 })),
      h(IconButton, { title: t('reader.prev'), disabled: page <= 1, onClick: () => ctrlRef.current?.goToPage(page - 1) }, h(Icon.ChevronLeft, { size: 16 })),
      h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)', whiteSpace: 'nowrap' } }, `${page}${t('reader.of')}${total || '–'}`),
      h(IconButton, { title: t('reader.next'), disabled: page >= total, onClick: () => ctrlRef.current?.goToPage(page + 1) }, h(Icon.ChevronRight, { size: 16 })),
      h('span', { style: { flex: 1 } }),
      h(IconButton, { title: t('reader.zoomOut'), onClick: () => ctrlRef.current?.setScale(1 / 1.2) }, h(Icon.Minus, { size: 16 })),
      h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' } }, `${Math.round(scale * 100)}%`),
      h(IconButton, { title: t('reader.zoomIn'), onClick: () => ctrlRef.current?.setScale(1.2) }, h(Icon.Plus, { size: 16 })),
      h(IconButton, { title: t('reader.toc'), onClick: () => setTocOpen((v) => !v) }, h(Icon.Toc, { size: 16 })),
      h(IconButton, { title: t('reader.search'), onClick: doSearch }, h(Icon.Search, { size: 16 })),
    ),
    tocOpen && outline.length
      ? h(
          'div',
          { className: 'zt-toc' },
          ...outline.map((o, i) =>
            h(
              'button',
              { key: `${o.title}-${i}`, 'data-depth': Math.min(3, o.depth ?? 0), onClick: () => ctrlRef.current?.goToDest(o.dest) },
              o.title,
            ),
          ),
        )
      : null,
    tocOpen && !outline.length ? h('div', { className: 'zt-toc' }, h('div', { className: 'zt-hint' }, '（无目录）')) : null,
    searchQ
      ? h(
          'div',
          { className: 'zt-toc' },
          h('div', { className: 'zt-row' },
            h('input', { className: 'zt-input', placeholder: t('reader.search'), value: searchQ, onChange: (e) => setSearchQ(e.target.value), onKeyDown: (e) => e.key === 'Enter' && doSearch() }),
            h(Button, { onClick: doSearch }, t('reader.search')),
          ),
          matches.length
            ? matches.slice(0, 20).map((m, i) => h('button', { key: i, onClick: () => ctrlRef.current?.goToPage(m.page) }, `p.${m.page}  ${m.preview}`))
            : h('div', { className: 'zt-hint' }, '0 结果'),
        )
      : null,
    error ? h('div', { className: 'zt-error', style: { padding: 16 } }, error) : null,
    !ready && !error ? h('div', { className: 'zt-empty' }, h(Spinner, { size: 20 }), h('p', null, t('reader.loading'))) : null,
    h('div', { className: 'zt-reader-scroll', ref: scrollRef, onScroll: updatePage }),
    annotations.length
      ? h(
          'div',
          { className: 'zt-toc', style: { maxHeight: '25%' } },
          h('div', { style: { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', padding: '0 8px 4px' } }, `${t('reader.notes')} (${annotations.length})`),
          ...annotations.map((a) =>
            h('button', { key: a.id, onClick: () => ctrlRef.current?.goToPage(a.pageIndex + 1) }, `p.${a.pageIndex + 1}  ${a.text.slice(0, 60)}${a.note ? ' · ' + a.note : ''}`),
          ),
        )
      : null,
  )
}

function PanelBody() {
  const state = useStore()
  if (state.view === 'settings') return h(SettingsPage, { key: 'settings' })
  if (state.view === 'diff') {
    const item = state.items.find((i) => i.key === state.selectedKey)
    return h(ConflictDiff, { key: 'diff', item, conflict: state.conflict })
  }
  if (state.view === 'reader') {
    const item = state.items.find((i) => i.key === state.selectedKey)
    if (item) return h(Reader, { key: item.key, item })
    return h(ItemList, { key: 'list' })
  }
  return h(ItemList, { key: 'list' })
}

function Panel({ onClose }) {
  const state = useStore()
  if (!state.open) return null

  const zoteroRunning = state.zotero?.running === true

  return h(
    'div',
    { className: 'zt-panel', style: { width: state.geometry.width } },
    h(PanelHeader, { onClose }),
    !state.loaded && state.loadError ? h('div', { className: 'zt-banner' }, t('banner.offline')) : null,
    !zoteroRunning ? h('div', { className: 'zt-banner' }, t('banner.zoteroDown')) : null,
    h('div', { className: 'zt-body' },
      state.view === 'list' ? h(SearchBar, { key: 'search' }) : null,
      h(PanelBody, { key: 'body' }),
    ),
    h(ResizeHandle, { edge: 'left' }),
    h(ResizeHandle, { edge: 'br' }),
  )
}

function SidebarButton({ wide }) {
  const state = useStore()
  return h(
    'button',
    {
      className: 'zt-iconbtn',
      style: { width: 36, height: 36, borderRadius: 12 },
      title: t('open'),
      'aria-label': t('open'),
      onClick: () => (state.open ? store.closePanel() : store.openPanel()),
    },
    h(Icon.Panel, { size: wide ? 16 : 18 }),
    wide ? h('span', { style: { marginLeft: 4, fontSize: 13 } }, t('entry')) : null,
  )
}

module.exports = { Panel, SidebarButton }
