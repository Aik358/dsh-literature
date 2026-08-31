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
      { style: { marginTop: 16, display: 'flex', gap: 8 } },
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
 * The menu is PORTALLED to the panel root and positioned relative to the
 * panel: anchoring it inside the trigger (a list card) would let the list's
 * overflow clip it and let sibling cards paint over it — the "menu hidden
 * behind the plugin body" bug.
 */
function Dropdown({ trigger, items, align = 'left' }) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState(null)
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const update = () => {
      const triggerEl = ref.current
      if (!triggerEl) return
      const panelEl = triggerEl.closest('.zt-panel')
      const pr = panelEl?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
      const r = triggerEl.getBoundingClientRect()
      const menuW = Math.min(280, Math.max(200, pr.right - pr.left - 16))
      // Flip upward only when there is genuinely no room below inside the panel.
      const below = pr.bottom - r.bottom
      const above = r.top - pr.top
      const up = below < 200 && above > below
      const left = Math.max(8, Math.min(align === 'right' ? r.right - menuW : r.left, pr.right - menuW - 8) - pr.left)
      const top = up ? Math.max(8, r.top - pr.top - 4 - 240) : r.bottom - pr.top + 4
      setPos({ left, top, menuW })
    }
    update()
    window.addEventListener('resize', update)
    const onDoc = (e) => {
      const insideMenu = typeof e.target?.closest === 'function' && !!e.target.closest('.zt-menu')
      if (!ref.current?.contains(e.target) && !insideMenu) setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, align])

  const menuEl = open
    ? ReactDOM.createPortal(
        h('div', {
          className: 'zt-menu',
          'data-align': align,
          style: pos ? { left: pos.left, top: pos.top, position: 'absolute', width: pos.menuW, minWidth: 'auto' } : null,
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
        ref.current?.closest('.zt-panel') ?? document.body,
      )
    : null

  return h(
    'span',
    { ref, style: { position: 'relative', display: 'inline-flex' } },
    trigger(setOpen, open),
    menuEl,
  )
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

function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return h('div', { className: 'zt-progress' }, h('i', { style: { width: `${pct}%` } }))
}

module.exports = { Icon, Spinner, Badge, Button, IconButton, EmptyState, ProgressBar, Dropdown, copyText }
