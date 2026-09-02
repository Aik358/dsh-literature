const React = require('react')
const h = React.createElement
const ReactDOM = require('react-dom')
const { useState, useEffect, useRef, useSyncExternalStore, useCallback } = React

const store = require('./store.cjs')
const { t, localizeError } = require('./i18n.cjs')
const { Icon, Spinner, Badge, Button, IconButton, EmptyState, ProgressBar, Dropdown, ContextMenu, copyText, downloadText } = require('./ui.cjs')
const { api } = require('./api.cjs')
const { createViewer, COLORS } = require('./pdf/viewer.cjs')
const { renderMiniMd } = require('./md.cjs')
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
    const sep = t('authors.join')
    parts.push(names.length > 3 ? t('authors.etAl', { names: names.slice(0, 3).join(sep) }) : names.join(sep))
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
      store.flash(t('action.copied', { label }))
    } catch (e) {
      store.flash(localizeError(e))
    }
  }
  const promptPages = (style, label) => {
    const pages = window.prompt(t('reader.pagesPrompt'), '12')
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
    { divider: true },
    { label: t('cite.bibtex'), hint: 'JabRef / Overleaf', onClick: () => run({ style: 'bibtex', mode: 'reference' }, 'BibTeX') },
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

function ItemCard({ item, selectMode, selected, onToggleSelect, onContextMenu }) {
  const busy = store.isBusy(item.key)
  const task = store.getSnapshot().tasks[item.key]
  const stateStr = String(item.state ?? '')
  const error = localizeError(item.error) ?? (stateStr.endsWith('_failed') ? t('state.' + stateStr) : '')
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

  // 5.8: tag chips on the card (add via prompt, remove per-chip).
  const cardTags = Array.isArray(item.tags) ? item.tags : []
  const addTag = () => {
    const input = window.prompt(t('list.tagAdd'))
    const tag = (input ?? '').trim().replace(/[,，]/g, '')
    if (!tag) return
    if (cardTags.includes(tag)) return
    store.setItemTags(item.key, [...cardTags, tag])
  }
  const removeTag = (tag) => {
    store.setItemTags(item.key, cardTags.filter((x) => x !== tag))
    // Keep the list-level tag filter honest when its tag disappears.
    if (store.getSnapshot().tagFilter === tag) store.setTagFilter('')
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
    {
      className: 'zt-card',
      'data-state': item.state,
      // Open the reader only when the click landed on the card body itself —
      // button / dropdown clicks must never bubble into navigation.
      onClick: (e) => {
        if (e.target.closest('button, input, select, textarea, a')) return
        if (item.pdf?.path) store.selectItem(item.key, 'reader')
      },
      // 5.10: right-click opens the citation menu directly on the card.
      onContextMenu: (e) => {
        if (!item.record) return
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e)
      },
    },
    h('div', { className: 'zt-row', style: { justifyContent: 'space-between', marginBottom: 4 } },
      h('div', { className: 'zt-row', style: { minWidth: 0 } },
        selectMode
          ? h('label', { className: 'zt-check', title: t('list.selectMode') },
              h('input', { type: 'checkbox', checked: !!selected, onChange: () => onToggleSelect?.() }),
            )
          : null,
        stateStr ? h(Badge, { tone }, t('state.' + stateStr)) : null,
        item.state === 'duplicate' ? h(Badge, { tone: 'warn' }, t('state.duplicate')) : null,
      ),
      savedBadge,
    ),
    h('h4', { className: 'zt-card-title' }, title),
    h('p', { className: 'zt-card-meta' }, metaLine(item)),
    cardTags.length || selectMode
      ? h('div', { className: 'zt-tags' },
          ...cardTags.map((tag) =>
            h('span', { key: tag, className: 'zt-tag' },
              h('span', { className: 'zt-tag-label' }, tag),
              h('button', {
                type: 'button',
                className: 'zt-tag-x',
                title: t('list.tagRemove'),
                onClick: () => removeTag(tag),
              }, 'x'),
            ),
          ),
          h('button', { type: 'button', className: 'zt-tag-add', title: t('list.tagAdd'), onClick: addTag }, '+'),
        )
      : null,
    h('div', { className: 'zt-card-id' }, identifierLine(item)),
    task ? h(ProgressBar, { value: task.progress }) : null,
    error ? h('div', { className: 'zt-error' }, error) : null,
    h('div', { className: 'zt-actions' }, ...actions),
  )
}

/** Loose-search results the user can pick from (Scribbr Autocite style). */
function CandidateList() {
  const state = useStore()
  const q = state.searchQuery ?? ''
  const open = (url) => window.open(url, '_blank')
  const ext = [
    { label: t('search.scholar'), onClick: () => open(`https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`) },
    { label: t('search.baidu'), onClick: () => open(`https://xueshu.baidu.com/s?wd=${encodeURIComponent(q)}`) },
    { label: t('search.cnki'), onClick: () => open(`https://search.cnki.com.cn/Search/Result?content=${encodeURIComponent(q)}`) },
  ]
  return h(
    'div',
    { className: 'zt-candidates' },
    h('div', { className: 'zt-row', style: { justifyContent: 'space-between', marginBottom: 4 } },
      h('span', { style: { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)' } },
        `${t('searchCandidates.title')}「${q}」`,
      ),
      h(Button, { variant: 'ghost', onClick: () => store.closeSearch() }, t('action.discard')),
    ),
    state.searchResults.map((c, i) =>
      h('div', { key: i, className: 'zt-cand' },
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'zt-cand-title' }, c.title),
          h('div', { className: 'zt-card-meta' }, [(c.authors ?? []).map((a) => a.lastName).join(', '), c.year, c.container].filter(Boolean).join(' · ')),
        ),
        h(Button, { variant: 'primary', onClick: () => store.addCandidate(c) }, t('searchCandidates.add')),
      ),
    ),
    state.searchResults.length === 0
      ? h('div', { className: 'zt-hint', style: { padding: '4px 2px' } }, t('searchCandidates.empty'))
      : null,
    h('div', { className: 'zt-row', style: { gap: 6, marginTop: 6 } },
      h('span', { className: 'zt-hint', style: { marginRight: 4 } }, t('searchCandidates.external')),
      ...ext.map((it, i) => h(Button, { key: i, onClick: it.onClick }, it.label)),
    ),
  )
}

function ItemList() {
  const state = useStore()
  const [dragging, setDragging] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const dragCounter = useRef(0)

  const onDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragEnter = () => {
    dragCounter.current += 1
    setDragging(true)
  }
  const onDragLeave = () => {
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (!dragCounter.current) setDragging(false)
  }
  const onDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.pdf$/i.test(f.name))
    if (!files.length) {
      store.flash(t('dropNoPdf'))
      return
    }
    for (const f of files) {
      store
        .dropPdf(f)
        .then(() => store.flash(`${t('dropOk')} ${f.name}`))
        .catch((err) => store.flash(localizeError(err)))
    }
  }

  const listProps = { className: 'zt-list', onDragOver, onDragEnter, onDragLeave, onDrop }
  if (dragging) listProps['data-dragging'] = '1'

  if (!state.loaded) {
    return h('div', listProps, h('div', { className: 'zt-skeleton' }), h('div', { className: 'zt-skeleton' }), h('div', { className: 'zt-skeleton' }))
  }
  if (state.items.length === 0) {
    return h('div', listProps, h(EmptyState, { key: 'empty' }))
  }

  const selectMode = state.selectMode === true
  const selection = state.selection ?? []
  const exportItems = [
    { label: 'RIS', onClick: () => store.exportSelected('ris') },
    { label: 'BibTeX', onClick: () => store.exportSelected('bibtex') },
    { label: 'CSL-JSON', onClick: () => store.exportSelected('csl-json') },
  ]

  // 5.8 filtering (status + tag) and 5.9 sorting — all pure front-end.
  const statusFilter = state.statusFilter ?? 'all'
  const tagFilter = state.tagFilter ?? ''
  const allTags = [...new Set(state.items.flatMap((i) => (Array.isArray(i.tags) ? i.tags : [])))].sort((a, b) => a.localeCompare(b, 'zh'))
  const statusChips = [
    { v: 'all', label: t('filter.all') },
    { v: 'pending', label: t('filter.pending') },
    { v: 'saved', label: t('filter.saved') },
    { v: 'failed', label: t('filter.failed') },
  ]
  const matches = (it) => {
    if (statusFilter === 'saved' && it.state !== 'saved') return false
    if (statusFilter === 'failed' && !String(it.state ?? '').endsWith('_failed')) return false
    if (statusFilter === 'pending' && (it.state === 'saved' || String(it.state ?? '').endsWith('_failed'))) return false
    if (tagFilter && !(Array.isArray(it.tags) ? it.tags : []).includes(tagFilter)) return false
    return true
  }
  const sortBy = state.sortBy ?? 'created'
  const sorted = state.items.filter(matches).slice().sort((a, b) => {
    if (sortBy === 'title') {
      const ta = a.record?.title || a.title || ''
      const tb = b.record?.title || b.title || ''
      return ta.localeCompare(tb, 'zh') || (b.createdAt ?? 0) - (a.createdAt ?? 0)
    }
    if (sortBy === 'year') {
      const ya = a.record?.year ?? a.year ?? 0
      const yb = b.record?.year ?? b.year ?? 0
      return yb - ya || (b.createdAt ?? 0) - (a.createdAt ?? 0)
    }
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
  const sortItems = [
    { label: t('filter.sortCreated'), hint: sortBy === 'created' ? '\u2713' : undefined, onClick: () => store.setSortBy('created') },
    { label: t('filter.sortTitle'), hint: sortBy === 'title' ? '\u2713' : undefined, onClick: () => store.setSortBy('title') },
    { label: t('filter.sortYear'), hint: sortBy === 'year' ? '\u2713' : undefined, onClick: () => store.setSortBy('year') },
  ]

  return h('div', { className: 'zt-listwrap' },
    h('div', { className: 'zt-filterbar' },
      ...statusChips.map((c) =>
        h('button', {
          key: c.v,
          type: 'button',
          className: 'zt-chip' + (statusFilter === c.v ? ' zt-chip-on' : ''),
          onClick: () => store.setStatusFilter(c.v),
        }, c.label),
      ),
      h('span', { style: { flex: 1 } }),
      h(Dropdown, {
        align: 'right',
        trigger: (setOpen, open) => h(IconButton, { title: t('filter.tag'), onClick: () => setOpen(!open) }, h(Icon.Tag, { size: 15 })),
        items: [
          { label: t('filter.all'), hint: !tagFilter ? '\u2713' : undefined, onClick: () => store.setTagFilter('') },
          ...allTags.map((tag) => ({ label: '#' + tag, hint: tagFilter === tag ? '\u2713' : undefined, onClick: () => store.setTagFilter(tag) })),
        ],
      }),
      h(Dropdown, {
        align: 'right',
        trigger: (setOpen, open) => h(IconButton, { title: t('filter.sort'), onClick: () => setOpen(!open) }, h(Icon.Sort, { size: 15 })),
        items: sortItems,
      }),
    ),
    h('div', { className: 'zt-listbar' },
      h('span', { style: { flex: 1 } }),
      h(Button, { variant: 'ghost', onClick: () => store.toggleSelectMode() }, t('list.selectMode')),
    ),
    sorted.length
      ? h('div', listProps, ...sorted.map((item) =>
          h(ItemCard, {
            key: item.key,
            item,
            selectMode,
            selected: selection.includes(item.key),
            onToggleSelect: () => store.toggleSelect(item.key),
            onContextMenu: (e) => setCtxMenu({ x: e.clientX, y: e.clientY, item }),
          }),
        ))
      : h('div', listProps, h('div', { className: 'zt-hint', style: { padding: '8px 2px' } }, t('filter.empty'))),
    selectMode
      ? h('div', { className: 'zt-selectbar' },
          h('span', { className: 'zt-hint', style: { flex: 1, minWidth: 0 } }, `${t('list.selectedPrefix')} ${selection.length}`),
          h(Button, { onClick: () => store.selectAllItems() }, t('list.selectAll')),
          h(Button, { variant: 'ghost', onClick: () => store.clearSelection() }, t('list.clear')),
          h(Dropdown, {
            align: 'right',
            trigger: (setOpen, open) => h(Button, { onClick: () => setOpen(!open), disabled: !selection.length }, t('list.exportTitle')),
            items: exportItems,
          }),
        )
      : null,
    ctxMenu ? h(ContextMenu, { key: 'ctx', x: ctxMenu.x, y: ctxMenu.y, items: citeMenuFor(ctxMenu.item), onClose: () => setCtxMenu(null) }) : null,
  )
}

function SearchBar() {
  const state = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const q = text.trim()
    if (!q) return
    setBusy(true)
    try {
      const created = await store.scanText(q)
      // No strict identifier matched (title / pasted text / unknown input):
      // fall back to the Scribbr-style loose search with candidates.
      if (!created?.length) {
        await store.searchCandidates(q)
      }
      setText('')
    } finally {
      setBusy(false)
    }
  }
  const importMenu = () => {
    const zoteroRunning = state.zotero?.running === true
    const runScan = async () => {
      if (!state.config?.importDir) {
        store.flash(t('importNoDir'))
        return
      }
      try {
        const r = await store.scanDir(state.config.importDir)
        store.flash(t('action.importedCount', { name: t('importDir'), count: r.imported?.length ?? 0 }))
      } catch (e) {
        store.flash(localizeError(e))
      }
    }
    const runZotero = async () => {
      try {
        const r = await store.importZotero(50)
        store.flash(t('action.importedCount', { name: t('importZotero'), count: r.count ?? 0 }))
      } catch (e) {
        store.flash(localizeError(e))
      }
    }
    return [
      { label: t('importDir'), hint: state.config?.importDir || t('importNoDirHint'), onClick: runScan },
      {
        label: t('importZotero'),
        hint: zoteroRunning ? t('importZoteroHint') : t('importZoteroDown'),
        disabled: !zoteroRunning,
        onClick: zoteroRunning ? runZotero : () => store.flash(t('banner.zoteroDown')),
      },
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

  return h(
    'div',
    { className: 'zt-header', ref: dragRef, onMouseDown: onDragStart },
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [matches, setMatches] = useState([])
  const [annotations, setAnnotations] = useState([])
  // AI assist: selection action bar, highlight action bar, ask-AI dialog.
  const [selMenu, setSelMenu] = useState(null)
  const [hlMenu, setHlMenu] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiQ, setAiQ] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const pageRef = useRef(1)
  const searchInputRef = useRef(null)
  const thumbsRef = useRef(null)
  const [thumbsOpen, setThumbsOpen] = useState(false)
  // Reader position memory (5.1): throttled save while scrolling, guaranteed
  // flush on unmount. ratio = scrollTop / (scrollHeight - clientHeight).
  const progressRef = useRef({ pageIndex: 0, ratio: 0, lastAt: 0 })

  const pdfUrl = item.pdf?.path ? api.pdfUrl(item.key) : item.zotero?.key ? api.zoteroPdfUrl(item.zotero.key) : null

  const runAi = async (opts) => {
    setAiBusy(true)
    try {
      await store.askAi(item.key, opts)
      store.flash(t('ai.sending'))
      setSelMenu(null)
      setHlMenu(null)
      setAiOpen(false)
      setAiQ('')
    } catch (e) {
      store.flash(localizeError(e))
    } finally {
      setAiBusy(false)
    }
  }
  const highlightSelection = (color) => {
    if (!selMenu || !ctrlRef.current) return
    const ctrl = ctrlRef.current
    const annotation = ctrl.addHighlight({
      pageIndex: selMenu.pageIndex,
      rects: selMenu.rects,
      text: selMenu.text,
      // 5.3: the user picks the color (colour palette in the selection bar);
      // COLORS[0] is the fallback default, no auto-rotation anymore.
      color: color ?? COLORS[0],
      note: '',
    })
    // addHighlight already emits 'annotation', which the handler below uses
    // to persist; just close the bar.
    void annotation
    setSelMenu(null)
  }
  const deleteHighlight = (id) => {
    ctrlRef.current?.removeHighlight(id)
    api.removeAnnotation(item.key, id).catch(() => {})
    setHlMenu(null)
  }

  // 5.1 reading-position memory: write {pageIndex, ratio} to the item at most
  // every 2s while scrolling, always once on unmount. The write is best-effort
  // (failure changes nothing user-visible); the next open restores the spot.
  const saveProgress = (force) => {
    const ctrl = ctrlRef.current
    const el = scrollRef.current
    if (!ctrl || !el || !el.scrollHeight) return
    const denom = el.scrollHeight - el.clientHeight
    const ratio = denom > 0 ? el.scrollTop / denom : 0
    const pageIndex = Math.max(0, ctrl.currentPage() - 1)
    const st = progressRef.current
    const now = Date.now()
    if (!force && now - st.lastAt < 2000 && st.pageIndex === pageIndex && Math.abs(st.ratio - ratio) < 0.01) return
    st.lastAt = now
    st.pageIndex = pageIndex
    st.ratio = ratio
    api.patchItem(item.key, { readerProgress: { pageIndex, ratio: Math.round(ratio * 1000) / 1000 } }).catch(() => {})
  }

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
        // 5.1 restore: relayout sets every page's height before emitting
        // 'scale', so that is the earliest safe moment to reapply the saved
        // scroll position (a raw ratio would target zero-height pages).
        const progress = item.readerProgress
        if (progress) {
          let restored = false
          const restore = () => {
            if (restored || disposed || !ctrlRef.current) return
            const el = scrollRef.current
            if (!el) return
            restored = true
            const denom = el.scrollHeight - el.clientHeight
            if (denom > 0 && typeof progress.ratio === 'number' && progress.ratio > 0) {
              el.scrollTop = progress.ratio * denom
            } else if (typeof progress.pageIndex === 'number' && progress.pageIndex > 0) {
              ctrl.goToPage(progress.pageIndex + 1)
            }
          }
          ctrl.on('scale', () => setTimeout(restore, 0))
          setTimeout(restore, 600)
        }
        ctrl.on('annotation', (annotation) => {
          // Keep the on-screen note list in sync immediately; the server write
          // is best-effort (the shadow store persists it).
          setAnnotations((prev) => [...prev, annotation])
          api.addAnnotation(item.key, annotation).catch(() => {})
        })
        ctrl.on('annotations-changed', (list) => setAnnotations(list))
        ctrl.on('selection', (s) => {
          setSelMenu(s)
          setHlMenu(null)
        })
        ctrl.on('highlight-click', ({ annotation: a, x, y }) => {
          setHlMenu({ annotation: a, x, y })
          setSelMenu(null)
        })
      } catch (e) {
        setError(e?.message ?? String(e))
      }
    })()

    return () => {
      disposed = true
      // 5.1: last chance to persist the reading position before the viewer
      // (and its scroll container) is torn down.
      saveProgress(true)
      ctrl?.destroy()
      ctrlRef.current = null
      setSelMenu(null)
      setHlMenu(null)
    }
  }, [pdfUrl, item.key])

  const updatePage = useCallback(() => {
    if (!ctrlRef.current) return
    const n = ctrlRef.current.currentPage()
    pageRef.current = n
    setPage(n)
  }, [])

  // 5.6: export the reader's highlights + notes as a Markdown file.
  const exportNotes = async () => {
    try {
      const { markdown, count } = await api.exportNotes(item.key)
      if (!count) {
        store.flash(t('reader.noNotes'))
        return
      }
      const stem = (item.title || item.key || 'notes').replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 60)
      downloadText(`${stem}.md`, markdown, 'text/markdown;charset=utf-8')
    } catch (e) {
      store.flash(localizeError(e))
    }
  }

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

  // First click reveals the search box (so the user can type); once the box is
  // open, clicking the toolbar button re-runs the current query.
  const toggleSearch = () => {
    if (!searchOpen) {
      setSearchOpen(true)
      setMatches([])
      return
    }
    doSearch()
  }

  // 5.2 keyboard shortcuts: arrows page, +/- zoom, / focuses search,
  // Esc dismisses the floating bars / search pane. Typing into any input is
  // never hijacked (search box, AI ask box, host chat).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (typeof t.isContentEditable === 'boolean' && t.isContentEditable))
      if (typing) return
      const ctrl = ctrlRef.current
      const n = pageRef.current
      switch (e.key) {
        case 'ArrowLeft':
          if (!ctrl) return
          e.preventDefault()
          ctrl.goToPage(Math.max(1, n - 1))
          break
        case 'ArrowRight':
          if (!ctrl) return
          e.preventDefault()
          ctrl.goToPage(Math.min(ctrl.numPages(), n + 1))
          break
        case '+':
        case '=':
          if (!ctrl) return
          e.preventDefault()
          ctrl.setScale(1.2)
          break
        case '-':
        case '_':
          if (!ctrl) return
          e.preventDefault()
          ctrl.setScale(1 / 1.2)
          break
        case '/':
          e.preventDefault()
          setSearchOpen(true)
          setSearchQ('')
          setMatches([])
          setTimeout(() => searchInputRef.current?.focus(), 0)
          break
        case 'Escape':
          setSelMenu(null)
          setHlMenu(null)
          setSearchOpen(false)
          setAiOpen(false)
          break
        default:
          return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const toggleToc = () => {
    if (!tocOpen && !outline.length) {
      store.flash(t('reader.noOutline'))
      return
    }
    setTocOpen((v) => !v)
  }

  // 5.11 thumbnail sidebar: small canvases at 0.25 scale, one click to jump.
  // Capped at 50 pages — beyond that, per-page renders would stall big PDFs.
  const toggleThumbs = () => {
    const ctrl = ctrlRef.current
    if (!ctrl) return
    if (!thumbsOpen && ctrl.numPages() > (ctrl.thumbLimit?.() ?? 50)) {
      store.flash(t('reader.thumbsTooMany'))
      return
    }
    setThumbsOpen((v) => !v)
  }
  useEffect(() => {
    if (!thumbsOpen || !ctrlRef.current || !thumbsRef.current) return undefined
    const ctrl = ctrlRef.current
    const total = ctrl.numPages()
    const host = thumbsRef.current
    host.textContent = ''
    const cells = []
    for (let i = 1; i <= total; i += 1) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'zt-thumb'
      btn.title = 'p.' + i
      const canvas = document.createElement('canvas')
      btn.appendChild(canvas)
      const label = document.createElement('span')
      label.textContent = String(i)
      btn.appendChild(label)
      btn.addEventListener('click', () => ctrl.goToPage(i))
      host.appendChild(btn)
      cells.push([canvas, i])
    }
    let cancelled = false
    ;(async () => {
      for (const [canvas, i] of cells) {
        if (cancelled || !ctrlRef.current) return
        await ctrl.renderThumb(i, canvas)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [thumbsOpen])

  // Clicking anywhere that is not the floating bars dismisses them; the bars
  // themselves stop propagation so their buttons survive the click.
  const dismissFloaters = (e) => {
    if (e.target.closest('.zt-ai-float')) return
    setSelMenu(null)
    setHlMenu(null)
  }

  if (!pdfUrl) {
    return h('div', { className: 'zt-empty' }, h('h4', null, t('reader.notDownloaded')), h('p', null, t('action.download')))
  }

  // The viewer reports selection/highlight positions in VIEWPORT coordinates,
  // and the bars are portalled to <body> as position:fixed — so they need no
  // conversion, only clamping to keep them fully on screen. Portalling is what
  // stops the reader's overflow:auto from clipping them near the edges (and
  // stops a narrow panel from cutting a bar that is wider than it).
  const clampBar = (pt) => {
    if (!pt) return null
    const M = 8
    const w = 360
    const hgt = 44
    return {
      left: Math.max(M, Math.min((pt.x ?? 0) - w / 2, Math.max(M, window.innerWidth - w - M))),
      top: Math.max(M, Math.min((pt.y ?? 0) - hgt - 8, Math.max(M, window.innerHeight - hgt - M))),
    }
  }
  const selPos = clampBar(selMenu)
  const hlPos = clampBar(hlMenu)

  const selectionBar = selMenu && selPos
    ? ReactDOM.createPortal(
        h('div', { className: 'zt-ai-float', style: { left: selPos.left, top: selPos.top } },
          h('button', { type: 'button', className: 'zt-ai-float-btn', onClick: () => runAi({ action: 'translate', selection: selMenu.text }) }, t('ai.translate')),
          h('button', { type: 'button', className: 'zt-ai-float-btn', onClick: () => runAi({ action: 'explain', selection: selMenu.text }) }, t('ai.explain')),
          h('button', { type: 'button', className: 'zt-ai-float-btn', onClick: () => runAi({ action: 'summarize', selection: selMenu.text }) }, t('ai.summarize')),
          // 5.3: user picks the highlight colour instead of an auto-rotation.
          h('span', { className: 'zt-color-group', title: t('ai.highlight') },
            ...COLORS.map((c) =>
              h('button', {
                key: c,
                type: 'button',
                className: 'zt-color-dot',
                'data-color': c,
                title: c,
                'aria-label': t('ai.highlight') + ' ' + c,
                onClick: (e) => {
                  e.stopPropagation()
                  highlightSelection(c)
                },
              }),
            ),
          ),
        ),
        document.body,
      )
    : null

  const highlightBar = hlMenu && hlPos
    ? ReactDOM.createPortal(
        h('div', { className: 'zt-ai-float', style: { left: hlPos.left, top: hlPos.top } },
          h('span', { className: 'zt-hl-float-text', title: hlMenu.annotation?.text ?? '' }, (hlMenu.annotation?.text ?? '').slice(0, 24)),
          h('button', { type: 'button', className: 'zt-ai-float-btn', onClick: () => ctrlRef.current?.goToPage(hlMenu.annotation.pageIndex + 1) }, t('ai.jump')),
          h('button', { type: 'button', className: 'zt-ai-float-btn zt-ai-float-btn-danger', onClick: () => deleteHighlight(hlMenu.annotation.id) }, t('reader.deleteAnnotation')),
        ),
        document.body,
      )
    : null

  const aiPanel = aiOpen
    ? h('div', { className: 'zt-ai-ask' },
        h('input', {
          className: 'zt-input',
          autoFocus: true,
          placeholder: t('ai.placeholder'),
          value: aiQ,
          onChange: (e) => setAiQ(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter' && aiQ.trim()) runAi({ action: 'ask', question: aiQ })
            if (e.key === 'Escape') setAiOpen(false)
          },
        }),
        h(Button, { variant: 'primary', disabled: !aiQ.trim() || aiBusy, loading: aiBusy, onClick: () => runAi({ action: 'ask', question: aiQ }) }, t('ai.ask')),
      )
    : null

  return h(
    'div',
    { className: 'zt-reader', 'data-night-mode': store.getSnapshot().config?.nightMode ?? 'auto', onMouseDown: dismissFloaters },
    h(
      'div',
      { className: 'zt-toolbar' },
      h(IconButton, { title: t('back'), onClick: () => store.setView('list') }, h(Icon.Back, { size: 16 })),
      h(IconButton, { title: t('reader.prev'), disabled: page <= 1, onClick: () => ctrlRef.current?.goToPage(page - 1) }, h(Icon.ChevronLeft, { size: 16 })),
      h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #666)', whiteSpace: 'nowrap' } }, `${page}${t('reader.of')}${total || '–'}`),
      h(IconButton, { title: t('reader.next'), disabled: page >= total, onClick: () => ctrlRef.current?.goToPage(page + 1) }, h(Icon.ChevronRight, { size: 16 })),
      h('span', { style: { flex: 1 } }),
      h(IconButton, { title: t('ai.tldr'), disabled: aiBusy, onClick: () => runAi({ action: 'tldr' }) }, h(Icon.Summarize, { size: 16 })),
      h(IconButton, { title: t('ai.askHint'), disabled: aiBusy, onClick: () => setAiOpen((v) => !v) }, h(Icon.Sparkle, { size: 16 })),
      h(IconButton, { title: t('reader.zoomOut'), onClick: () => ctrlRef.current?.setScale(1 / 1.2) }, h(Icon.Minus, { size: 16 })),
      h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' } }, `${Math.round(scale * 100)}%`),
      h(IconButton, { title: t('reader.zoomIn'), onClick: () => ctrlRef.current?.setScale(1.2) }, h(Icon.Plus, { size: 16 })),
      h(IconButton, { title: t('reader.toc'), onClick: toggleToc }, h(Icon.Toc, { size: 16 })),
      h(IconButton, { title: t('reader.thumbs'), onClick: toggleThumbs }, h(Icon.Thumb, { size: 16 })),
      h(IconButton, { title: t('reader.search'), onClick: toggleSearch }, h(Icon.Search, { size: 16 })),
      h(IconButton, { title: t('reader.exportNotes'), onClick: exportNotes }, h(Icon.Download, { size: 16 })),
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
    tocOpen && !outline.length ? h('div', { className: 'zt-toc' }, h('div', { className: 'zt-hint' }, t('reader.noOutline'))) : null,
    searchOpen
      ? h(
          'div',
          { className: 'zt-toc' },
          h('div', { className: 'zt-row' },
            h('input', {
              className: 'zt-input',
              ref: searchInputRef,
              autoFocus: true,
              placeholder: t('reader.search'),
              value: searchQ,
              onChange: (e) => setSearchQ(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter') doSearch()
                if (e.key === 'Escape') setSearchOpen(false)
              },
            }),
            h(Button, { onClick: doSearch }, t('reader.search')),
          ),
          matches.length
            ? matches.slice(0, 20).map((m, i) => h('button', { key: i, onClick: () => ctrlRef.current?.goToPage(m.page) }, `p.${m.page}  ${m.preview}`))
            : searchQ
              ? h('div', { className: 'zt-hint' }, t('reader.noResults'))
              : null,
        )
      : null,
    aiPanel,
    error ? h('div', { className: 'zt-error', style: { padding: 16 } }, error) : null,
    !ready && !error ? h('div', { className: 'zt-empty' }, h(Spinner, { size: 20 }), h('p', null, t('reader.loading'))) : null,
    h('div', { className: 'zt-reader-main' },
      thumbsOpen ? h('div', { className: 'zt-thumbs', ref: thumbsRef }) : null,
      h('div', { className: 'zt-reader-scroll', ref: scrollRef, onScroll: (e) => { updatePage(); saveProgress(false); setSelMenu(null); setHlMenu(null) } }),
    ),
    // selectionBar / highlightBar are React portals (see above) — their DOM
    // lives on <body> as position:fixed, so nothing renders at these spots.
    selectionBar,
    highlightBar,
    annotations.length
      ? h(
          'div',
          { className: 'zt-toc', style: { maxHeight: '25%' } },
          h('div', { style: { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', padding: '0 8px 4px' } }, `${t('reader.notes')} (${annotations.length})`),
          ...annotations.map((a) =>
            h('button', { key: a.id, onClick: () => ctrlRef.current?.goToPage(a.pageIndex + 1) },
              h('span', null, `p.${a.pageIndex + 1}  ${a.text.slice(0, 60)}`),
              a.note
                ? h('span', {
                    className: 'zt-note-md',
                    dangerouslySetInnerHTML: { __html: renderMiniMd(a.note.length > 80 ? a.note.slice(0, 80) + '…' : a.note) },
                  })
                : null,
            ),
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
    // The entry vanished (removed elsewhere); fall back to the list view
    // instead of leaving the reader shell rendered with no document.
    return h(ItemList, { key: 'list' })
  }
  if (state.searchResults?.length) {
    return h('div', { key: 'listwrap', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
      h(CandidateList, { key: 'candidates' }),
      h(ItemList, { key: 'list' }),
    )
  }
  return h(ItemList, { key: 'list' })
}

function Panel({ onClose, embedded = false }) {
  const state = useStore()
  const open = embedded ? true : state.open
  // Connect the SSE progress stream ONLY while the panel is actually visible.
  // In footer mode the Panel component stays mounted (the overlay slot keeps
  // it registered) even while rendering null, so a mount-scoped effect would
  // hold one same-origin connection forever; keying on visibility releases it
  // the moment the panel closes. The pool has ~6 connections and DSH itself
  // keeps several open — every held connection queues PDF fetches behind it.
  useEffect(() => {
    if (!open) return undefined
    store.ensureEvents()
    return () => store.releaseEvents()
  }, [open])
  if (!open) return null

  const zoteroRunning = state.zotero?.running === true
  // Warn only when the current mode actually depends on the external app.
  const needZotero = state.config?.saveMode === 'zotero'

  // The banner must not linger after a successful built-in import: it only
  // means "the configured save target is unreachable", and switching the
  // target one click away fixes it.
  const switchToBuiltin = async () => {
    try {
      await store.saveConfig({ saveMode: 'builtin' })
      store.flash(t('banner.switched'))
    } catch (e) {
      store.flash(localizeError(e))
    }
  }

  // Positioning lives on the ROOT (the only fixed-positioned element). The
  // header is statically positioned, so left/top on it did nothing — the
  // floating window simply never moved. Once a dragged position exists we
  // must also neutralise the stylesheet's right/bottom anchors, or the panel
  // gets stretched between the dragged top-left corner and the fixed
  // bottom-right one (height changes as you drag).
  const rootStyle = { width: state.geometry.width }
  if (state.geometry.x != null || state.geometry.y != null) {
    rootStyle.left = state.geometry.x ?? null
    rootStyle.top = state.geometry.y ?? 8
    rootStyle.right = 'auto'
    rootStyle.bottom = 'auto'
  }

  return h(
    'div',
    {
      className: embedded ? 'zt-panel zt-panel-embedded' : 'zt-panel',
      style: embedded ? undefined : rootStyle,
    },
    h(PanelHeader, { onClose, embedded }),
    !state.loaded && state.loadError ? h('div', { className: 'zt-banner' }, t('banner.offline')) : null,
    state.flash ? h('div', { className: 'zt-toast' }, state.flash) : null,
    needZotero && !zoteroRunning
      ? h('div', { className: 'zt-banner zt-banner-row' },
          h('span', { style: { flex: 1, minWidth: 0 } }, t('banner.zoteroDown')),
          h('button', { className: 'zt-btn zt-banner-btn', type: 'button', onClick: switchToBuiltin }, t('banner.switchBuiltin')),
        )
      : null,
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
 * `visible` (active + panel open); while the tab is hidden we unmount — that
 * releases the SSE stream and stops background rendering. The cost is the
 * reader re-initialising on the next visit, which is the right trade: a
 * permanently-held connection was queueing real work behind it.
 */
function LibraryTab(props) {
  if (props && props.visible === false) return null
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
