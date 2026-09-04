const { api, subscribe: subscribeEvents } = require('./api.cjs')
const { t, localizeError, subscribe: subscribeLocale, setPreference } = require('./i18n.cjs')

/**
 * A minimal external store so components can use React 18's
 * `useSyncExternalStore` without pulling in a state library.
 */

const LS_KEY = 'dsh-literature:panel'
const SORT_KEY = 'dsh-literature:sort'

function readSort() {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v === 'title' || v === 'year' ? v : 'created'
  } catch {
    return 'created'
  }
}

function readPersisted() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

const persisted = readPersisted()

let state = {
  open: false,
  items: [],
  tasks: {},
  config: null,
  zotero: null,
  selectedCollection: null,
  selectedKey: null,
  view: 'list',
  conflict: null,
  busy: {},
  loaded: false,
  loadError: '',
  flash: '',
  searchResults: [],
  searchQuery: '',
  searchLoading: false,
  // Multi-select for batch export (5.7).
  selectMode: false,
  selection: [],
  // Library filters (5.8) + sort (5.9, persisted).
  statusFilter: 'all',
  tagFilter: '',
  sortBy: readSort(),
  // panel geometry, restored from localStorage
  geometry: {
    x: persisted.x ?? null,
    y: persisted.y ?? null,
    width: persisted.width ?? 380,
    tocOpen: persisted.tocOpen ?? false,
  },
}

let snapshot = state
const listeners = new Set()

function emit() {
  snapshot = state
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* detached */
    }
  }
}

function set(patch) {
  state = { ...state, ...patch }
  emit()
}

function setGeometry(patch) {
  const next = { ...state.geometry, ...patch }
  state = { ...state, geometry: next }
  emit()
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ x: next.x, y: next.y, width: next.width, tocOpen: next.tocOpen }))
  } catch {
    /* storage blocked */
  }
}

function getSnapshot() {
  return snapshot
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Language switches must repaint every mounted component, but the translated
 * strings are read synchronously via t() — they are not part of `state`. We
 * therefore bump a counter so `state` gets a new identity: useSyncExternalStore
 * compares snapshots by reference, so re-emitting an unchanged object would be
 * ignored and the UI would stay in the old language until the next interaction.
 */
subscribeLocale(() => {
  state = { ...state, localeVersion: (state.localeVersion ?? 0) + 1 }
  emit()
})

function setBusy(key, on) {
  const busy = { ...state.busy }
  if (on) busy[key] = (busy[key] ?? 0) + 1
  else busy[key] = Math.max(0, (busy[key] ?? 1) - 1)
  set({ busy })
}

function isBusy(key) {
  return (state.busy[key] ?? 0) > 0
}

/* ---------------- actions ---------------- */

async function refresh() {
  set({ loadError: '' })
  try {
    const data = await api.state()
    // The saved language preference is applied as soon as the config lands,
    // before the first paint, so the panel never flashes the wrong language.
    if (data.config?.uiLanguage) setPreference(data.config.uiLanguage)
    set({
      config: data.config,
      zotero: data.zotero,
      items: data.items ?? [],
      tasks: Object.fromEntries((data.tasks ?? []).map((t) => [t.key, t])),
      selectedCollection: data.selectedCollection ?? null,
      loaded: true,
    })
  } catch (e) {
    set({ loadError: localizeError(e), loaded: true })
  }
}

async function scanText(text) {
  if (!text?.trim()) return []
  const created = await api.scan(text)
  // Auto-resolve when configured; progress arrives over SSE.
  if (created?.length && state.config?.autoResolve !== false) {
    await Promise.allSettled(created.map((c) => api.resolve(c.key)))
  }
  await refresh()
  return created ?? []
}

let flashTimer = null
function flash(message) {
  set({ flash: message })
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => set({ flash: '' }), 2400)
}

async function scanDir(dir) {
  const result = await api.scanDir(dir)
  await refresh()
  return result
}

async function importZotero(limit = 50) {
  const result = await api.importZotero(limit)
  await refresh()
  return result
}

async function citeItem(key, opts) {
  return api.cite(key, opts)
}

/**
 * Steers an AI-assist action into the current DSH conversation. `sessionId`
 * is read from the browser runtime when available so the message lands in the
 * chat the user is actually looking at.
 */
async function askAi(key, opts = {}) {
  const payload = { key, ...opts }
  const sid = currentSessionReader?.() ?? null
  if (sid) payload.sessionId = sid
  return api.aiAsk(payload)
}

/** Installed by the client entry with `ctx.sessions.list.getSnapshot().current`. */
let currentSessionReader = null
function setSessionReader(fn) {
  currentSessionReader = typeof fn === 'function' ? fn : null
}

async function searchCandidates(q) {
  const { candidates } = await api.searchCandidates(q, 8)
  set({ searchResults: candidates ?? [], searchQuery: q, searchLoading: false })
  return candidates ?? []
}

async function addCandidate(candidate) {
  const { item } = await api.addCandidate(candidate)
  set({ searchResults: [], searchQuery: '' })
  await refresh()
  return item
}

function closeSearch() {
  set({ searchResults: [], searchQuery: '', searchLoading: false })
}

async function dropPdf(file) {
  const { item } = await api.dropPdf(file)
  await refresh()
  return item
}

async function importPdf(key, file, opts) {
  setBusy(key, true)
  try {
    const { item } = await api.importPdf(key, file, opts)
    await refresh()
    return item
  } finally {
    setBusy(key, false)
  }
}

async function resolveItem(key) {
  setBusy(key, true)
  try {
    await api.resolve(key)
    await refresh()
  } finally {
    setBusy(key, false)
  }
}

async function fetchPdf(key) {
  setBusy(key, true)
  try {
    await api.fetch(key)
    await refresh()
  } finally {
    setBusy(key, false)
  }
}

async function saveItem(key, opts) {
  setBusy(key, true)
  try {
    await api.save(key, opts)
    await refresh()
  } finally {
    setBusy(key, false)
  }
}

async function retryItem(key) {
  setBusy(key, true)
  try {
    await api.retry(key)
    await refresh()
  } finally {
    setBusy(key, false)
  }
}

function toggleSelectMode() {
  set({ selectMode: !state.selectMode, selection: state.selectMode ? [] : state.selection })
}

function toggleSelect(key) {
  const cur = state.selection
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [key, ...cur]
  set({ selection: next })
}

function selectAllItems() {
  set({ selection: state.items.map((i) => i.key), selectMode: true })
}

function clearSelection() {
  set({ selection: [] })
}

async function exportSelected(format) {
  const keys = state.selection.slice()
  if (!keys.length) {
    flash(t('list.noSelection'))
    return
  }
  try {
    const { text: payload, format: used } = await api.exportBatch(keys, format)
    const ext = { ris: 'ris', bibtex: 'bib', 'csl-json': 'json' }[used] ?? 'txt'
    const { downloadText } = require('./ui.cjs')
    downloadText(`literature-export-${Date.now()}.${ext}`, payload, used === 'csl-json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8')
    flash(t('list.exported') + ' ' + keys.length)
  } catch (e) {
    flash(localizeError(e))
  }
}

function setStatusFilter(v) {
  set({ statusFilter: v })
}

function setKindFilter(v) {
  set({ kindFilter: v === 'paper' || v === 'courseware' ? v : 'all' })
}

function setTagFilter(v) {
  set({ tagFilter: v })
}

function setSortBy(v) {
  const next = v === 'title' || v === 'year' ? v : 'created'
  set({ sortBy: next })
  try {
    localStorage.setItem(SORT_KEY, next)
  } catch { /* storage blocked */ }
}

/** Adds/removes a card's tags via the PATCH endpoint and mirrors locally. */
async function setItemTags(key, tags) {
  const list = Array.isArray(tags) ? tags.filter((x) => typeof x === 'string' && x.trim()) : []
  if (!list.length && !Array.isArray(tags)) return
  try {
    const { item } = await api.patchItem(key, { tags: list })
    set({ items: state.items.map((i) => (i.key === key ? item : i)) })
    return item
  } catch (e) {
    flash(localizeError(e))
    return null
  }
}

async function discardItem(key) {
  setBusy(key, true)
  try {
    await api.discard(key)
    if (state.selectedKey === key) set({ selectedKey: null, view: 'list' })
    await refresh()
  } finally {
    setBusy(key, false)
  }
}

async function showDiff(key) {
  set({ conflict: null, view: 'diff' })
  try {
    const { conflict } = await api.diff(key)
    set({ conflict, view: 'diff', selectedKey: key })
  } catch (e) {
    set({ conflict: { error: localizeError(e) }, view: 'diff' })
  }
}

function openPanel() {
  set({ open: true })
  if (!state.loaded) refresh()
}

function closePanel() {
  set({ open: false })
}

function selectItem(key, view) {
  set({ selectedKey: key, view: view ?? 'reader' })
}

function setView(view) {
  set({ view, ...(view !== 'diff' ? { conflict: null } : {}) })
}

async function saveConfig(patch) {
  const { config } = await api.saveConfig(patch)
  // Applying the preference here makes a language switch take effect the
  // moment it is saved — no panel reopen or page reload required.
  if (patch?.uiLanguage) setPreference(patch.uiLanguage)
  set({ config })
  return config
}

/** Applies SSE pushes so progress updates without polling. */
function attachEvents() {
  return subscribeEvents((type, data) => {
    if (type === 'poll') {
      // Degraded mode (SSE unavailable): the server snapshot replaces the
      // local copy wholesale — identical to what refresh() does.
      set({
        items: data.items ?? state.items,
        tasks: data.tasks ?? state.tasks,
        zotero: { ...state.zotero, ...(data.zotero ?? {}) },
      })
      return
    }
    if (type === 'item') {
      const items = state.items.slice()
      const idx = items.findIndex((i) => i.key === data.key)
      if (idx >= 0) items[idx] = { ...items[idx], ...data }
      else items.unshift(data)
      set({ items })
      return
    }
    if (type === 'task') {
      const tasks = { ...state.tasks }
      if (data.state === 'done' || data.state === 'failed' || data.state === 'cancelled') {
        delete tasks[data.key]
      } else {
        tasks[data.key] = data
      }
      set({ tasks })
      return
    }
    if (type === 'removed') {
      set({ items: state.items.filter((i) => i.key !== data.key) })
      return
    }
    if (type === 'status') {
      set({ zotero: { ...state.zotero, ...data } })
    }
  })
}

// The SSE stream is ref-counted: connect when the panel becomes visible,
// release when it closes, so the connection pool stays available for PDF
// fetches. EventSource auto-reconnects on its own once connected.
let eventsDisposer = null
let eventsRefs = 0

function ensureEvents() {
  eventsRefs += 1
  if (eventsDisposer) return
  try {
    eventsDisposer = attachEvents()
  } catch (e) {
    eventsRefs = Math.max(0, eventsRefs - 1)
    console.warn('[dsh-literature] SSE attach failed:', e?.message)
  }
}

function releaseEvents() {
  eventsRefs = Math.max(0, eventsRefs - 1)
  if (eventsRefs > 0 || !eventsDisposer) return
  try {
    eventsDisposer()
  } catch {
    /* already closed */
  }
  eventsDisposer = null
}

const store = {
  getSnapshot,
  subscribe,
  set,
  setGeometry,
  refresh,
  scanText,
  resolveItem,
  fetchPdf,
  saveItem,
  retryItem,
  discardItem,
  setStatusFilter,
  setKindFilter,
  setTagFilter,
  setSortBy,
  setItemTags,
  toggleSelectMode,
  toggleSelect,
  selectAllItems,
  clearSelection,
  exportSelected,
  importPdf,
  scanDir,
  importZotero,
  citeItem,
  dropPdf,
  searchCandidates,
  addCandidate,
  closeSearch,
  flash,
  showDiff,
  openPanel,
  closePanel,
  selectItem,
  setView,
  saveConfig,
  attachEvents,
  ensureEvents,
  releaseEvents,
  isBusy,
  askAi,
  setSessionReader,
}

module.exports = store
