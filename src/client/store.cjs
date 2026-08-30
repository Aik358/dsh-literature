const { api, subscribe: subscribeEvents } = require('./api.cjs')

/**
 * A minimal external store so components can use React 18's
 * `useSyncExternalStore` without pulling in a state library.
 */

const LS_KEY = 'dsh-literature:panel'

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
    set({
      config: data.config,
      zotero: data.zotero,
      items: data.items ?? [],
      tasks: Object.fromEntries((data.tasks ?? []).map((t) => [t.key, t])),
      selectedCollection: data.selectedCollection ?? null,
      loaded: true,
    })
  } catch (e) {
    set({ loadError: e.message, loaded: true })
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
    set({ conflict: { error: e.message }, view: 'diff' })
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
  set({ config })
  return config
}

/** Applies SSE pushes so progress updates without polling. */
function attachEvents() {
  return subscribeEvents((type, data) => {
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
  importPdf,
  showDiff,
  openPanel,
  closePanel,
  selectItem,
  setView,
  saveConfig,
  attachEvents,
  isBusy,
}

module.exports = store
