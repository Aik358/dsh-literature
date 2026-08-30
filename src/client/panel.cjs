const React = require('react')
const h = React.createElement
const { useState, useEffect, useRef, useSyncExternalStore, useCallback } = React

const store = require('./store.cjs')
const { t } = require('./i18n.cjs')
const { Icon, Spinner, Badge, Button, IconButton, EmptyState, ProgressBar, Dropdown, copyText } = require('./ui.cjs')
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
  needs_login: 'warn',
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

/** Builds the citation dropdown items for a card. */
function citeMenuFor(item) {
  const run = async (opts, label) => {
    try {
      const { text } = await store.citeItem(item.key, opts)
      await copyText(text)
      store.flash(`${label} 已复制`)
    } catch (e) {
      store.flash(e.message)
    }
  }
  const promptPages = (style, label) => {
    const pages = window.prompt('页码（如 12-15）', '12')
    if (pages) run({ style, mode: 'direct', pages }, label)
  }
  return [
    { label: t('cite.reference'), hint: 'APA 7th', onClick: () => run({ style: 'apa', mode: 'reference' }, 'APA') },
    { label: t('cite.reference'), hint: 'GB/T 7714', onClick: () => run({ style: 'gb', mode: 'reference' }, 'GB/T 7714') },
    { label: t('cite.reference'), hint: 'MLA 9th', onClick: () => run({ style: 'mla', mode: 'reference' }, 'MLA') },
    { label: t('cite.reference'), hint: 'Chicago 17th', onClick: () => run({ style: 'chicago', mode: 'reference' }, 'Chicago') },
    { divider: true },
    { label: t('cite.intext'), hint: 'APA', onClick: () => run({ style: 'apa', mode: 'intext' }, t('cite.intext')) },
    { label: t('cite.intext'), hint: 'GB/T', onClick: () => run({ style: 'gb', mode: 'intext' }, t('cite.intext')) },
    { divider: true },
    { label: t('cite.direct'), hint: 'APA', onClick: () => promptPages('apa', t('cite.direct')) },
    { label: t('cite.direct'), hint: 'GB/T', onClick: () => promptPages('gb', t('cite.direct')) },
  ]
}

/** Search the item on external services (Scholar / Baidu / CNKI). */
function searchMenuFor(item) {
  const q = encodeURIComponent(item.record?.title || item.title || item.rawValue || '')
  const sourceUrl = item.record?.url || (item.doi ? `https://doi.org/${item.doi}` : '')
  const open = (url) => window.open(url, '_blank')
  return [
    { label: t('search.scholar'), onClick: () => open(`https://scholar.google.com/scholar?q=${q}`) },
    { label: t('search.baidu'), onClick: () => open(`https://xueshu.baidu.com/s?wd=${q}`) },
    { label: t('search.cnki'), onClick: () => open(`https://search.cnki.com.cn/Search/Result?content=${q}`) },
    sourceUrl ? { divider: true } : null,
    sourceUrl ? { label: t('search.source'), onClick: () => open(sourceUrl) } : null,
  ].filter(Boolean)
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
    // Whatever the failure code, if the item has a resolvable source page we
    // always surface the sign-in / manual-download path — paywalls, 403s and
    // institutional-only books all end up here and all need the same rescue.
    const code = item.error?.code
    const sourceUrl = item.record?.url || (item.doi ? `https://doi.org/${item.doi}` : '')
    if (sourceUrl) {
      const loginish = code === 'paywalled' || code === 'needs_login'
      actions.push(
        h(Button, { key: 'login', onClick: () => window.open(sourceUrl, '_blank') }, loginish ? t('action.openLoginPage') : t('action.openSource')),
        h(ImportPdfButton, { key: 'import', item }),
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
    if (item.saveMode === 'builtin') {
      // Saved into the plugin's own library — Zotero and the filesystem are
      // optional exports from here.
      actions.push(
        h(Button, { key: 'tozotero', onClick: () => store.saveItem(item.key, { mode: 'zotero' }) }, t('action.exportToLibrary')),
        h(Button, { key: 'todir', onClick: () => store.saveItem(item.key, { mode: 'dir' }) }, t('action.exportToDir')),
      )
    }
    if (item.saveMode === 'zotero' && item.zotero?.key) {
      actions.push(
        h(Button, { key: 'zotero', onClick: () => window.open(`zotero://select/library/items/${item.zotero.key}`, '_blank') }, t('action.openInZotero')),
      )
    }
  }

  if (item.state === 'resolved' || item.state === 'fetched' || item.state === 'save_failed') {
    actions.push(h(Button, { key: 'diff', onClick: () => store.showDiff(item.key) }, t('action.diff')))
  }
  actions.push(h(Button, { key: 'discard', variant: 'ghost', onClick: () => store.discardItem(item.key) }, t('action.discard')))
  if (item.record) {
    actions.push(
      h(Dropdown, {
        key: 'cite',
        align: 'left',
        trigger: (setOpen, open) =>
          h(IconButton, { title: t('cite.title'), onClick: () => setOpen(!open) }, h(Icon.Quote, { size: 15 })),
        items: citeMenuFor(item),
      }),
      h(Dropdown, {
        key: 'search',
        align: 'left',
        trigger: (setOpen, open) =>
          h(IconButton, { title: t('search.title'), onClick: () => setOpen(!open) }, h(Icon.Search, { size: 15 })),
        items: searchMenuFor(item),
      }),
    )
  }

  const title = item.record?.title || item.title || item.display || item.rawValue || 'Untitled'

  const savedBadge =
    item.state === 'saved'
      ? item.saveMode === 'builtin'
        ? h(Badge, { tone: 'success' }, t('badge.builtin'))
        : item.saveMode === 'zotero'
          ? h(Badge, { tone: 'success' }, t('badge.library'))
          : h(Badge, { tone: 'success' }, t('badge.dir'))
      : null

  return h(
    'div',
    { className: 'zt-card', 'data-state': item.state, onClick: () => item.pdf?.path && store.selectItem(item.key, 'reader') },
    h('div', { className: 'zt-row', style: { justifyContent: 'space-between', marginBottom: 4 } },
      h('div', { className: 'zt-row', style: { minWidth: 0 } },
        h(Badge, { tone }, t('state.' + item.state)),
        item.state === 'duplicate' ? h(Badge, { tone: 'warn' }, t('state.duplicate')) : null,
      ),
      savedBadge,
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
  const state = useStore()
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
  const importMenu = () => {
    const runScan = async () => {
      if (!state.config?.importDir) {
        store.flash(t('importNoDir'))
        return
      }
      try {
        const r = await store.scanDir(state.config.importDir)
        store.flash(`${t('importDir')}：新增 ${r.imported?.length ?? 0} 条`)
      } catch (e) {
        store.flash(e.message)
      }
    }
    const runZotero = async () => {
      try {
        const r = await store.importZotero(50)
        store.flash(`${t('importZotero')}：新增 ${r.count ?? 0} 条`)
      } catch (e) {
        store.flash(e.message)
      }
    }
    return [
      { label: t('importDir'), hint: state.config?.importDir || t('importNoDirHint'), onClick: runScan },
      { label: t('importZotero'), hint: t('importZoteroHint'), onClick: runZotero },
    ]
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
    h(Dropdown, {
      align: 'right',
      trigger: (setOpen, open) =>
        h(IconButton, { title: t('importMenu'), onClick: () => setOpen(!open) }, h(Icon.Folder, { size: 15 })),
      items: importMenu(),
    }),
  )
}

function PanelHeader({ onClose, embedded = false }) {
  const state = useStore()
  const dragRef = useRef(null)
  const zoteroRunning = state.zotero?.running === true
  // The library-status badge only matters in Zotero-export mode; the built-in
  // library and directory mode work with nothing external running.
  const statusBadge =
    state.config?.saveMode === 'zotero'
      ? zoteroRunning
        ? h(Badge, { tone: 'success' }, t('status.running'))
        : h(Badge, { tone: 'warn' }, t('status.down'))
      : h(Badge, { tone: 'info' }, t('badge.mode.' + (state.config?.saveMode ?? 'builtin')))

  const onDragStart = embedded ? null : (e) => {
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
    h('div', { className: 'zt-row', style: { gap: 4 } }, statusBadge),
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
          mode: store.getSnapshot().config?.readerFit ?? 'fit-width',
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

function ImportPdfButton({ item }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  return h(
    'span',
    null,
    h('input', {
      ref: inputRef,
      type: 'file',
      accept: 'application/pdf,.pdf',
      style: { display: 'none' },
      onChange: async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setBusy(true)
        try {
          await store.importPdf(item.key, file)
        } catch (err) {
          console.warn('[dsh-literature] import failed', err)
        } finally {
          setBusy(false)
        }
      },
    }),
    h(Button, { onClick: () => inputRef.current?.click(), loading: busy, title: t('action.importPdfHint') }, t('action.importPdf')),
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

function Panel({ onClose, embedded = false }) {
  const state = useStore()
  if (!state.open && !embedded) return null

  const zoteroRunning = state.zotero?.running === true
  // Warn only when the current mode actually depends on the external app.
  const needZotero = state.config?.saveMode === 'zotero'

  return h(
    'div',
    {
      className: embedded ? 'zt-panel zt-panel-embedded' : 'zt-panel',
      style: embedded ? undefined : { width: state.geometry.width },
    },
    h(PanelHeader, { onClose, embedded }),
    !state.loaded && state.loadError ? h('div', { className: 'zt-banner' }, t('banner.offline')) : null,
    state.flash ? h('div', { className: 'zt-toast' }, state.flash) : null,
    needZotero && !zoteroRunning ? h('div', { className: 'zt-banner' }, t('banner.zoteroDown')) : null,
    h('div', { className: 'zt-body' },
      state.view === 'list' ? h(SearchBar, { key: 'search' }) : null,
      h(PanelBody, { key: 'body' }),
    ),
    !embedded ? h(ResizeHandle, { edge: 'left' }) : null,
    !embedded ? h(ResizeHandle, { edge: 'br' }) : null,
  )
}

/**
 * Container rendered inside a `dsh-better-sidebar` tab. The host passes
 * `visible` (active + panel open); we keep the component mounted so the PDF
 * reader doesn't reload on every tab switch.
 */
function LibraryTab(props) {
  return h(Panel, { embedded: true, onClose: () => {} })
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

module.exports = { Panel, SidebarButton, LibraryTab }
