const React = require('react')

/**
 * pdf.js wrapper. The library is required lazily so its (large) module body
 * only executes the first time the reader actually opens, and the worker runs
 * from a Blob URL because the DSH module loader only ever serves this one file.
 */

let pdfjs = null
let workerReady = false

function loadPdfjs() {
  if (pdfjs) return pdfjs
  // eslint-disable-next-line global-require
  pdfjs = require('pdfjs-dist')
  if (!workerReady && typeof __PDFJS_WORKER_SRC__ === 'string' && __PDFJS_WORKER_SRC__ && typeof Worker !== 'undefined') {
    try {
      const blob = new Blob([__PDFJS_WORKER_SRC__], { type: 'text/javascript' })
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob)
      workerReady = true
    } catch {
      /* falls back to pdf.js's fake worker on the main thread */
    }
  }
  return pdfjs
}

const COLORS = ['yellow', 'green', 'blue', 'pink']
const PDF_TO_CSS_UNITS = 96 / 72

function normalizedRectsFromSelection(range, pageEl) {
  const pageRect = pageEl.getBoundingClientRect()
  const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1)
  const rects = []
  for (const r of clientRects) {
    rects.push({
      left: (r.left - pageRect.left) / pageRect.width,
      top: (r.top - pageRect.top) / pageRect.height,
      width: r.width / pageRect.width,
      height: r.height / pageRect.height,
    })
  }
  return rects
}

/**
 * @param {HTMLElement} root scroll container
 * @param {{pdfUrl: string, docId: string, annotations: Array, onAnnotationsChange: Function}} options
 */
async function createViewer(root, options) {
  const lib = loadPdfjs()
  const controller = {
    destroyed: false,
    doc: null,
    pages: [],
    scale: 1,
    mode: 'fit-width',
    pageEls: new Map(),
    rendered: new Set(),
    observer: null,
    outline: [],
    textIndex: [],
    annotations: options.annotations ?? [],
    listeners: {},
  }

  const emit = (event, payload) => {
    controller.listeners[event]?.forEach((fn) => fn(payload))
  }
  controller.on = (event, fn) => {
    controller.listeners[event] = controller.listeners[event] ?? new Set()
    controller.listeners[event].add(fn)
    return () => controller.listeners[event].delete(fn)
  }

  const loadingTask = lib.getDocument({ url: options.pdfUrl, withCredentials: false, isEvalSupported: false })
  controller.loadingTask = loadingTask
  controller.doc = await loadingTask.promise
  if (controller.destroyed) return controller

  const total = controller.doc.numPages
  controller.pages = new Array(total).fill(null)

  // -- structure -----------------------------------------------------------
  const frag = document.createDocumentFragment()
  for (let i = 1; i <= total; i += 1) {
    const pageEl = document.createElement('div')
    pageEl.className = 'zt-page'
    pageEl.dataset.page = String(i)
    frag.appendChild(pageEl)
    controller.pageEls.set(i, pageEl)
  }
  root.appendChild(frag)

  try {
    controller.outline = (await controller.doc.getOutline()) ?? []
  } catch {
    controller.outline = []
  }

  // -- lazy rendering ------------------------------------------------------
  const renderPage = async (pageNum) => {
    if (controller.rendered.has(pageNum) || controller.destroyed) return
    controller.rendered.add(pageNum)
    const pageEl = controller.pageEls.get(pageNum)
    if (!pageEl) return
    try {
      const page = await controller.doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: controller.scale * PDF_TO_CSS_UNITS })
      pageEl.style.setProperty('--zt-total-scale', String(viewport.scale))

      let canvas = pageEl.querySelector('canvas')
      if (!canvas) {
        canvas = document.createElement('canvas')
        pageEl.appendChild(canvas)
        const textLayerEl = document.createElement('div')
        textLayerEl.className = 'textLayer'
        pageEl.appendChild(textLayerEl)
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      pageEl.style.width = `${viewport.width}px`
      pageEl.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      await page.render({ canvasContext: ctx, viewport }).promise
      if (controller.destroyed) return

      const textLayerEl = pageEl.querySelector('.textLayer')
      if (textLayerEl) {
        const textContent = await page.getTextContent()
        const TextLayer = lib.TextLayer
        const layer = new TextLayer({ textContentSource: textContent, container: textLayerEl, viewport })
        await layer.render()
      }
      drawAnnotations(pageNum, pageEl)
      emit('pagerendered', { page: pageNum })
    } catch (e) {
      if (e?.name === 'RenderingCancelledException') {
        controller.rendered.delete(pageNum)
        return
      }
      pageEl.textContent = `页面 ${pageNum} 渲染失败: ${e?.message ?? e}`
    }
  }

  const clearRendered = () => {
    for (const [, el] of controller.pageEls) {
      const canvas = el.querySelector('canvas')
      if (canvas) canvas.remove()
      const tl = el.querySelector('.textLayer')
      if (tl) tl.remove()
    }
    controller.rendered.clear()
  }

  controller.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const n = Number(entry.target.dataset.page)
          if (Number.isFinite(n)) renderPage(n)
        }
      }
    },
    { root, rootMargin: '600px 0px' },
  )
  for (const [, el] of controller.pageEls) controller.observer.observe(el)

  // -- scale ---------------------------------------------------------------
  const applyScale = (mode, explicit) => {
    controller.mode = mode ?? controller.mode
    if (explicit) controller.scale = explicit
    const first = root.querySelector('.zt-page')
    const containerWidth = root.clientWidth - 24
    if (controller.mode === 'fit-width') {
      const baseWidth = controller.doc.getPage(1).then ? null : null
      void baseWidth
      // Derive from the first page's intrinsic size.
      controller.doc
        .getPage(1)
        .then((page) => {
          const vp = page.getViewport({ scale: 1 })
          controller.scale = Math.max(0.2, (containerWidth / vp.width) / PDF_TO_CSS_UNITS)
          relayout()
        })
        .catch(() => {})
      return
    }
    if (controller.mode === 'fit-page') {
      controller.doc
        .getPage(1)
        .then((page) => {
          const vp = page.getViewport({ scale: 1 })
          const h = Math.max(200, root.clientHeight - 24)
          controller.scale = Math.max(0.2, Math.min(containerWidth / vp.width, h / vp.height) / PDF_TO_CSS_UNITS)
          relayout()
        })
        .catch(() => {})
      return
    }
    void first
    relayout()
  }

  const relayout = () => {
    clearRendered()
    controller.doc
      .getPage(1)
      .then((page) => {
        const vp = page.getViewport({ scale: controller.scale * PDF_TO_CSS_UNITS })
        for (const [, el] of controller.pageEls) {
          el.style.width = `${vp.width}px`
          el.style.height = `${vp.height}px`
        }
        // Re-observe so visible pages re-render at the new scale.
        for (const [, el] of controller.pageEls) controller.observer.observe(el)
        emit('scale', { scale: controller.scale })
      })
      .catch(() => {})
  }

  controller.setScale = (delta) => {
    controller.mode = 'custom'
    applyScale('custom', Math.min(6, Math.max(0.25, controller.scale * delta)))
  }
  controller.setFit = (mode) => applyScale(mode)
  controller.getScale = () => controller.scale
  controller.getMode = () => controller.mode

  // -- navigation ----------------------------------------------------------
  controller.goToPage = (n) => {
    const el = controller.pageEls.get(n)
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  controller.currentPage = () => {
    const mid = root.scrollTop + root.clientHeight / 2
    let best = 1
    for (const [n, el] of controller.pageEls) {
      const top = el.offsetTop
      if (top <= mid) best = n
    }
    return best
  }
  controller.numPages = () => total
  controller.outline = controller.outline
  controller.goToDest = async (dest) => {
    try {
      const explicit = typeof dest === 'string' ? await controller.doc.getDestination(dest) : dest
      if (!explicit) return
      const ref = explicit[0]
      const pageIndex = typeof ref === 'object' ? await controller.doc.getPageIndex(ref) : ref
      controller.goToPage(pageIndex + 1)
    } catch {
      /* unresolvable destination */
    }
  }

  // -- search --------------------------------------------------------------
  const buildTextIndex = async () => {
    if (controller.textIndex.length) return controller.textIndex
    const index = []
    for (let i = 1; i <= total; i += 1) {
      try {
        const page = await controller.doc.getPage(i)
        const tc = await page.getTextContent()
        const text = tc.items.map((it) => it.str).join(' ')
        index.push({ page: i, text: text.replace(/\s+/g, ' ').trim() })
      } catch {
        index.push({ page: i, text: '' })
      }
    }
    controller.textIndex = index
    return index
  }

  controller.search = async (query) => {
    const q = String(query ?? '').trim()
    if (!q) return []
    const index = await buildTextIndex()
    const needle = q.toLowerCase()
    const out = []
    for (const entry of index) {
      const hay = entry.text.toLowerCase()
      let at = hay.indexOf(needle)
      while (at !== -1 && out.length < 200) {
        out.push({
          page: entry.page,
          preview: entry.text.slice(Math.max(0, at - 30), at + needle.length + 40).trim(),
        })
        at = hay.indexOf(needle, at + needle.length)
      }
    }
    return out
  }

  controller.highlightMatches = (query) => {
    const needle = String(query ?? '').trim().toLowerCase()
    for (const [, el] of controller.pageEls) {
      const spans = el.querySelectorAll('.textLayer span')
      for (const span of spans) {
        const text = (span.textContent ?? '').toLowerCase()
        if (needle && text.includes(needle)) span.style.backgroundColor = 'rgba(250, 204, 21, .45)'
        else span.style.backgroundColor = ''
      }
    }
  }

  // -- annotations ---------------------------------------------------------
  function drawAnnotations(pageNum, pageEl) {
    pageEl.querySelectorAll('.zt-highlight').forEach((el) => el.remove())
    for (const a of controller.annotations) {
      if (a.pageIndex !== pageNum - 1) continue
      for (const r of a.rects ?? []) {
        const el = document.createElement('div')
        el.className = 'zt-highlight'
        el.dataset.color = a.color ?? 'yellow'
        el.dataset.annotationId = a.id ?? ''
        el.style.left = `${r.left * 100}%`
        el.style.top = `${r.top * 100}%`
        el.style.width = `${r.width * 100}%`
        el.style.height = `${r.height * 100}%`
        el.title = a.note ?? a.text ?? ''
        pageEl.appendChild(el)
      }
    }
  }

  controller.setAnnotations = (list) => {
    controller.annotations = list ?? []
    for (const [n, el] of controller.pageEls) drawAnnotations(n, el)
  }

  const onMouseUp = (event) => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const pageEl = sel.anchorNode?.parentElement?.closest('.zt-page')
    if (!pageEl || !pageEl.contains(sel.anchorNode)) return
    const range = sel.getRangeAt(0)
    const rects = normalizedRectsFromSelection(range, pageEl)
    const text = sel.toString().trim()
    if (!text || !rects.length) return
    const annotation = {
      id: `an_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pageIndex: Number(pageEl.dataset.page) - 1,
      rects,
      text,
      color: COLORS[controller.annotations.length % COLORS.length],
      note: '',
      createdAt: Date.now(),
    }
    controller.annotations.push(annotation)
    drawAnnotations(annotation.pageIndex + 1, pageEl)
    sel.removeAllRanges()
    emit('annotation', annotation)
  }
  root.addEventListener('mouseup', onMouseUp)

  controller.destroy = () => {
    controller.destroyed = true
    root.removeEventListener('mouseup', onMouseUp)
    controller.observer?.disconnect()
    for (const [, el] of controller.pageEls) el.remove()
    controller.pageEls.clear()
    controller.loadingTask?.destroy?.().catch(() => {})
  }

  applyScale(options.mode ?? 'fit-width')
  return controller
}

module.exports = { createViewer, loadPdfjs, COLORS, PDF_TO_CSS_UNITS }
