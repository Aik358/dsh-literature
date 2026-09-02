const React = require('react')
const h = React.createElement
const ReactDOM = require('react-dom')
const { t } = require('./i18n.cjs')
const store = require('./store.cjs')

/**
 * Icons are drawn inline with `currentColor` so they pick up whatever
 * `--dsw-alias-label-*` colour the surrounding element resolves to. The host
 * exposes an `Icon*` set through `dsh-client-ui-primitives`, but that package
 * only exists inside the compiled shell (it is not installable), so the prop
 * contract can't be verified at build time. Inline paths keep the plugin
 * renderable and still theme-correct; swapping to the host set is a safe
 * follow-up once the signature is confirmed.
 */

function svg(children, size = 16) {
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    children,
  )
}

const Icon = {
  Close: (props) => svg([h('path', { d: 'M6 6l12 12M18 6L6 18' })], props?.size),
  Settings: (props) =>
    svg(
      [
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' }),
      ],
      props?.size,
    ),
  Back: (props) => svg([h('path', { d: 'M15 18l-6-6 6-6' })], props?.size),
  Download: (props) => svg([h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3' })], props?.size),
  Refresh: (props) => svg([h('path', { d: 'M21 12a9 9 0 11-2.6-6.4M21 3v6h-6' })], props?.size),
  Folder: (props) => svg([h('path', { d: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z' })], props?.size),
  Read: (props) =>
    svg([h('path', { d: 'M2 4h6a4 4 0 014 4v12a3 3 0 00-3-3H2zM22 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7z' })], props?.size),
  ChevronLeft: (props) => svg([h('path', { d: 'M15 18l-6-6 6-6' })], props?.size),
  ChevronRight: (props) => svg([h('path', { d: 'M9 18l6-6-6-6' })], props?.size),
  ChevronDown: (props) => svg([h('path', { d: 'M6 9l6 6 6-6' })], props?.size),
  Plus: (props) => svg([h('path', { d: 'M12 5v14M5 12h14' })], props?.size),
  Minus: (props) => svg([h('path', { d: 'M5 12h14' })], props?.size),
  Search: (props) => svg([h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'M20 20l-3.5-3.5' })], props?.size),
  Trash: (props) =>
    svg([h('path', { d: 'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6' })], props?.size),
  Link: (props) =>
    svg([h('path', { d: 'M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12.2 19' })], props?.size),
  Check: (props) => svg([h('path', { d: 'M20 6L9 17l-5-5' })], props?.size),
  Warn: (props) => svg([h('path', { d: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01' })], props?.size),
  Toc: (props) => svg([h('path', { d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' })], props?.size),
  Book: (props) => svg([h('path', { d: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5z' })], props?.size),
  Panel: (props) => svg([h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }), h('path', { d: 'M9 3v18' })], props?.size),
  Quote: (props) =>
    svg([h('path', { d: 'M10 11H6a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2v6a4 4 0 01-4 4M21 11h-4a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2v6a4 4 0 01-4 4' })], props?.size),
  Summarize: (props) =>
    svg([h('path', { d: 'M4 6h16M4 10h16M4 14h10M4 18h7M15 17l2 2 4-4' })], props?.size),
  Sparkle: (props) =>
    svg([h('path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z' })], props?.size),
  Tag: (props) => svg([h('path', { d: 'M20.6 13.4L11 3.8A2 2 0 009.6 3H5a2 2 0 00-2 2v4.6a2 2 0 00.6 1.4l9.6 9.6a2 2 0 002.8 0l4.6-4.6a2 2 0 000-2.8z' }), h('circle', { cx: 7.5, cy: 7.5, r: 1.2, fill: 'currentColor', stroke: 'none' })], props?.size),
  Sort: (props) => svg([h('path', { d: 'M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 20V4' })], props?.size),
  Thumb: (props) => svg([h('rect', { x: 3, y: 3, width: 8, height: 8, rx: 1 }), h('rect', { x: 13, y: 3, width: 8, height: 8, rx: 1 }), h('rect', { x: 3, y: 13, width: 8, height: 8, rx: 1 }), h('rect', { x: 13, y: 13, width: 8, height: 8, rx: 1 })], props?.size),
}

function Spinner({ size = 16 }) {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        width: size,
        height: size,
        animation: 'zt-spin 0.8s linear infinite',
      },
    },
    svg([h('path', { d: 'M21 12a9 9 0 11-6.2-8.6' })], size),
  )
}

function Badge({ tone = 'info', children }) {
  return h('span', { className: 'zt-badge', 'data-tone': tone }, children)
}

function Button({ variant, onClick, disabled, loading, title, children }) {
  return h(
    'button',
    {
      className: 'zt-btn',
      'data-variant': variant,
      onClick,
      disabled: disabled || loading,
      title,
      type: 'button',
    },
    loading ? h(Spinner, { size: 14 }) : null,
    children,
  )
}

function IconButton({ onClick, title, disabled, children }) {
  return h('button', { className: 'zt-iconbtn', onClick, title, disabled, type: 'button', 'aria-label': title }, children)
}

function EmptyState({ onScan }) {
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = async () => {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try {
      await store.scanText(text)
      setText('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return h(
    'div',
    { className: 'zt-empty' },
    h('div', { style: { display: 'flex', justifyContent: 'center', color: 'var(--dsw-alias-label-tertiary, #8a8a8a)' } }, h(Icon.Book, { size: 28 })),
    h('h4', null, t('empty.title')),
    h('p', null, t('empty.body')),
    h(
      'div',
      { style: { marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h('input', {
        className: 'zt-input',
        placeholder: t('empty.placeholder'),
        value: text,
        onChange: (e) => setText(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter') submit()
        },
      }),
      h(Button, { variant: 'primary', onClick: submit, loading: busy, disabled: !text.trim() }, t('empty.add')),
    ),
    error ? h('div', { className: 'zt-error' }, error) : null,
  )
}

/**
 * Lightweight dropdown menu: `trigger` is a render-prop (setOpen, open),
 * `items` is a list of { label, hint?, icon?, onClick?, divider?, disabled? }.
 *
 * THE MENU IS PORTALLED TO <body> AND POSITIONED IN VIEWPORT COORDINATES.
 *
 * That is not cosmetic — it is what keeps the menu usable: the panel clips its
 * children (`overflow: hidden`) and the list scrolls, so a menu anchored inside
 * a card gets cut off at the panel edge, and sibling content can paint over it
 * (the "menu hidden behind the plugin body" bug). Portalling to <body> with
 * `position: fixed` puts it outside every clipping and stacking context the
 * host creates, so no container can cut it and no sibling can cover it.
 *
 * Placement is measured, not guessed: the menu's real height is read after it
 * mounts, then it is flipped up only when the space below is genuinely too
 * small, and its max-height is clamped to the space available on that side —
 * so it scrolls inside the viewport instead of running off it.
 */

/**
 * Lightweight context menu for right-click actions (5.10). Same placement
 * discipline as Dropdown: portalled to <body>, measured once mounted, flipped
 * up when the space below is too small, clamped to the viewport.
 */
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = React.useRef(null)
  const [pos, setPos] = React.useState(null)

  React.useLayoutEffect(() => {
    if (typeof x !== 'number' || typeof y !== 'number') return
    const M = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuW = Math.min(300, Math.max(220, vw - M * 2))
    const realH = menuRef.current?.offsetHeight ?? 0
    const menuH = realH || Math.min(320, (items?.length ?? 0) * 34 + 8)
    const below = vh - y - M
    const above = y - M
    const up = below < menuH && above > below
    const maxH = Math.max(120, Math.min(menuH, up ? above : below))
    const left = Math.max(M, Math.min(x, vw - menuW - M))
    const top = up ? Math.max(M, y - maxH) : Math.min(y, vh - maxH - M)
    setPos({ left, top, menuW, maxH })
  }, [x, y, items])

  React.useEffect(() => {
    if (typeof x !== 'number' || typeof y !== 'number') return
    const onDoc = (e) => {
      if (typeof e.target?.closest === 'function' && e.target.closest('.zt-menu')) return
      onClose?.()
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onEsc)
    }
  }, [x, y, onClose])

  if (typeof x !== 'number' || typeof y !== 'number') return null
  return ReactDOM.createPortal(
    h(
      'div',
      {
        ref: menuRef,
        className: 'zt-menu',
        style: pos ? { left: pos.left, top: pos.top, width: pos.menuW, maxHeight: pos.maxH } : { left: x, top: y, visibility: 'hidden' },
      },
      ...(items ?? []).map((it, i) =>
        it.divider
          ? h('div', { key: i, className: 'zt-menu-divider' })
          : h(
              'button',
              {
                key: i,
                className: 'zt-menu-item',
                type: 'button',
                disabled: it.disabled === true,
                onClick: () => {
                  onClose?.()
                  it.onClick?.()
                },
              },
              it.icon ? h('span', { className: 'zt-menu-icon' }, it.icon) : null,
              h('span', { className: 'zt-menu-label' }, it.label),
              it.hint ? h('span', { className: 'zt-menu-hint' }, it.hint) : null,
            ),
      ),
    ),
    document.body,
  )
}

function Dropdown({ trigger, items, align = 'left' }) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState(null)
  const ref = React.useRef(null)
  const menuRef = React.useRef(null)

  const place = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const M = 8
    const GAP = 4
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuW = Math.min(280, Math.max(200, vw - M * 2))
    // Real height once the menu exists; before that, estimate from the rows.
    const realH = menuRef.current?.offsetHeight
    const menuH = realH || Math.min(320, items.length * 34 + 8)
    const below = vh - r.bottom - GAP - M
    const above = r.top - GAP - M
    const up = below < Math.min(menuH, 180) && above > below
    const avail = Math.max(120, up ? above : below)
    const h = Math.min(menuH, avail)
    let left = align === 'right' ? r.right - menuW : r.left
    left = Math.max(M, Math.min(left, vw - menuW - M))
    const top = up ? Math.max(M, r.top - GAP - h) : r.bottom + GAP
    // Skip the state update when nothing moved: the scroll/resize trackers
    // fire continuously while the list scrolls, and a fresh object here would
    // re-render the menu on every frame for no visual change.
    setPos((prev) => {
      if (prev && prev.left === left && prev.top === top && prev.menuW === menuW && prev.maxH === avail) return prev
      return { left, top, menuW, maxH: avail }
    })
  }, [align, items.length])

  // Runs before paint, so the measured placement is what the user sees —
  // no first-frame jump from the guessed position.
  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place()
  }, [open, place])

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      const target = e.target
      if (ref.current?.contains(target)) return
      if (typeof target?.closest === 'function' && target.closest('.zt-menu')) return
      setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    // The menu is fixed to the viewport, so it has to track its trigger when
    // anything moves (window resize, list scroll, panel resize).
    const onMove = () => place()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  const menuEl = open
    ? ReactDOM.createPortal(
        h(
          'div',
          {
            ref: menuRef,
            className: 'zt-menu',
            'data-align': align,
            style: pos
              ? { left: pos.left, top: pos.top, width: pos.menuW, maxHeight: pos.maxH }
              : { left: 0, top: 0, visibility: 'hidden' },
          },
          ...items.map((it, i) =>
            it.divider
              ? h('div', { key: i, className: 'zt-menu-divider' })
              : h(
                  'button',
                  {
                    key: i,
                    className: 'zt-menu-item',
                    type: 'button',
                    disabled: it.disabled === true,
                    title: it.disabled && it.disabledHint ? it.disabledHint : undefined,
                    onClick: () => {
                      if (it.disabled === true) return
                      setOpen(false)
                      it.onClick?.()
                    },
                  },
                  it.icon ? h('span', { className: 'zt-menu-icon' }, it.icon) : null,
                  h('span', { className: 'zt-menu-label' }, it.label),
                  it.hint ? h('span', { className: 'zt-menu-hint' }, it.hint) : null,
                ),
          ),
        ),
        document.body,
      )
    : null

  return h('span', { ref, style: { position: 'relative', display: 'inline-flex' } }, trigger(setOpen, open), menuEl)
}

/** Clipboard with a legacy fallback (the host is a Chromium renderer). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}


/** Downloads a string as a file through a Blob URL. */
function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return h('div', { className: 'zt-progress' }, h('i', { style: { width: `${pct}%` } }))
}

module.exports = { Icon, Spinner, Badge, Button, IconButton, EmptyState, ProgressBar, Dropdown, ContextMenu, copyText, downloadText }
