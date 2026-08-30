/**
 * All styling goes through DSH's own alias tokens so the panel tracks the
 * active theme with no JavaScript: the host switches themes by rewriting
 * `body[data-ds-dark-theme]` and the inline alias values, and everything here
 * is a `var(--dsw-alias-*)` reference.
 *
 * There are no radius/spacing/font tokens in the design system, so those are
 * taken from measured values in `dsh-client-ui-sidebar`: 12px panels, 8px
 * controls, 36px control boxes, 8/12/16px spacing, 14px body text.
 */

const STYLE_ID = 'dsh-literature-plugin-css'

const CSS = `
.zt-panel {
  position: fixed;
  top: 8px;
  right: 8px;
  bottom: 8px;
  width: 380px;
  min-width: 300px;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px 0 rgba(0,0,0,.05), 0 2px 8px 0 rgba(0,0,0,.04));
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  overflow: hidden;
  z-index: 40;
}

.zt-panel[hidden] { display: none; }

/* When embedded as a tab inside dsh-better-sidebar's right panel, the panel
   stops being a floating window and fills its host container. */
.zt-panel.zt-panel-embedded {
  position: static;
  inset: auto;
  width: 100% !important;
  min-width: 0;
  max-width: none;
  height: 100%;
  border: none;
  border-radius: 0;
  box-shadow: none;
  z-index: auto;
}
.zt-panel-embedded .zt-handle-l,
.zt-panel-embedded .zt-handle-br { display: none; }

.zt-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, #fafafa);
  cursor: grab;
  user-select: none;
  flex: 0 0 auto;
}
.zt-header:active { cursor: grabbing; }

.zt-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zt-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #666);
  cursor: pointer;
  flex: 0 0 auto;
  transition: background .15s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1));
}
.zt-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-iconbtn:active { background: var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.2)); }
.zt-iconbtn[disabled] { opacity: .4; cursor: default; }

.zt-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

.zt-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.zt-list[data-dragging='1'] {
  outline: 2px dashed var(--dsw-alias-brand-primary, #4d6bfe);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 6%, transparent);
}

.zt-card {
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fafafa);
  transition: border-color .15s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1)), background .15s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1));
}
.zt-card:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.08)); }
.zt-card[data-selected='1'] { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.zt-card[data-state$='_failed'] { border-color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-card[data-state='duplicate'] { border-color: var(--dsw-alias-state-warn-primary, #b06000); }

.zt-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #1f1f1f);
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.zt-card-meta {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #666);
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.zt-card-id {
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  word-break: break-all;
}

.zt-row { display: flex; align-items: center; gap: 8px; }
.zt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

.zt-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill, transparent);
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background .15s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1));
}
.zt-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-btn[disabled] { opacity: .45; cursor: default; }
.zt-btn[data-variant='primary'] {
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.zt-btn[data-variant='primary']:hover { background: var(--dsw-alias-button-primary-hover, #3d58e0); }
.zt-btn[data-variant='ghost'] { border-color: transparent; background: transparent; }

.zt-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 20px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12));
  color: var(--dsw-alias-label-secondary, #666);
  white-space: nowrap;
}
.zt-badge[data-tone='success'] { color: var(--dsw-alias-state-success-primary, #137333); }
.zt-badge[data-tone='warn'] { color: var(--dsw-alias-state-warn-primary, #b06000); }
.zt-badge[data-tone='error'] { color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-badge[data-tone='info'] { color: var(--dsw-alias-label-secondary, #666); }

.zt-progress { height: 2px; border-radius: 1px; background: var(--dsw-alias-bg-skeleton, rgba(128,128,128,.16)); overflow: hidden; margin-top: 8px; }
.zt-progress > i { display: block; height: 100%; background: var(--dsw-alias-brand-primary, #4d6bfe); transition: width .2s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1)); }

.zt-error { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }

.zt-empty { padding: 32px 16px; text-align: center; color: var(--dsw-alias-label-secondary, #666); }
.zt-empty h4 { margin: 12px 0 4px; font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary, #1f1f1f); }
.zt-empty p { margin: 0; font-size: 13px; }

.zt-skeleton { height: 76px; border-radius: 8px; background: var(--dsw-alias-bg-skeleton, rgba(128,128,128,.14)); animation: zt-pulse 1.4s var(--ds-ease-in-out, ease-in-out) infinite; }
@keyframes zt-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }

.zt-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-state-warn-secondary, rgba(176,96,0,.08));
  color: var(--dsw-alias-state-warn-label, #8a4b00);
}

.zt-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); flex: 0 0 auto; }
.zt-input {
  flex: 1; min-width: 0; height: 28px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 8px; background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 13px; font-family: inherit;
}

/* ---- reader ---- */
.zt-reader { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #fff); }
.zt-reader-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.zt-page { position: relative; background: #fff; box-shadow: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,.05)); line-height: 0; }
.zt-page > canvas { display: block; width: 100%; height: auto; }

/* pdf.js text layer, trimmed from pdf_viewer.css and re-themed. */
.zt-page .textLayer {
  color-scheme: only light;
  position: absolute; inset: 0; overflow: clip; opacity: 1;
  line-height: 1; letter-spacing: normal; word-spacing: normal;
  text-size-adjust: none; forced-color-adjust: none;
  transform-origin: 0 0; z-index: 0;
}
.zt-page .textLayer :is(span, br) {
  color: transparent; position: absolute; white-space: pre; cursor: text;
  transform-origin: 0% 0%; user-select: text;
}
.zt-page .textLayer > :not(.markedContent),
.zt-page .textLayer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--zt-total-scale, 1) * var(--font-height));
  --scale-x: 1; --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x));
}
.zt-page .textLayer .markedContent { display: contents; }
.zt-page .textLayer ::selection { background: rgba(0, 0, 255, .25); color: transparent; }

.zt-highlight { position: absolute; border-radius: 2px; pointer-events: auto; cursor: pointer; mix-blend-mode: multiply; }
.zt-highlight[data-color='yellow'] { background: rgba(250, 204, 21, .38); }
.zt-highlight[data-color='green']  { background: rgba(34, 197, 94, .32); }
.zt-highlight[data-color='blue']   { background: rgba(59, 130, 246, .30); }
.zt-highlight[data-color='pink']   { background: rgba(244, 114, 182, .34); }

.zt-toc { max-height: 40%; overflow: auto; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); padding: 8px; }
.zt-toc button {
  display: block; width: 100%; text-align: left; padding: 4px 8px; margin: 0;
  border: none; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary, #666); font-size: 13px; font-family: inherit; cursor: pointer;
}
.zt-toc button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-toc button[data-depth='1'] { padding-left: 20px; }
.zt-toc button[data-depth='2'] { padding-left: 32px; }
.zt-toc button[data-depth='3'] { padding-left: 44px; }

/* ---- settings ---- */
.zt-settings { padding: 16px; overflow-y: auto; }
.zt-field { margin-bottom: 16px; }
.zt-field > label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--dsw-alias-label-primary, #1f1f1f); }
.zt-field > .zt-hint { margin-top: 4px; }
.zt-field select, .zt-field input[type='text'] {
  width: 100%; box-sizing: border-box; height: 32px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 8px; background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f); font-size: 13px; font-family: inherit;
}

/* ---- diff ---- */
.zt-diff { padding: 16px; overflow-y: auto; }
.zt-diff table { width: 100%; border-collapse: collapse; font-size: 13px; }
.zt-diff th, .zt-diff td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); vertical-align: top; }
.zt-diff th { color: var(--dsw-alias-label-secondary, #666); font-weight: 500; white-space: nowrap; }
.zt-diff td.del { color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-diff td.add { color: var(--dsw-alias-state-success-primary, #137333); }

/* ---- settings advanced group ---- */
.zt-advanced { margin: 16px 0 4px; }
.zt-advanced > summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #666);
  padding: 4px 0;
  user-select: none;
}
.zt-advanced[open] > summary { margin-bottom: 8px; color: var(--dsw-alias-label-primary, #1f1f1f); }

/* ---- dropdown menu ---- */
.zt-menu {
  position: absolute;
  top: calc(100% + 4px);
  min-width: 200px;
  max-width: 280px;
  padding: 4px;
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px 0 rgba(0,0,0,.08));
  z-index: 60;
  display: flex;
  flex-direction: column;
}
.zt-menu[data-align='left'] { left: 0; }
.zt-menu[data-align='right'] { right: 0; }
.zt-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.zt-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-menu-item:active { background: var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.2)); }
.zt-menu-icon { display: inline-flex; color: var(--dsw-alias-label-secondary, #666); }
.zt-menu-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zt-menu-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary, #8a8a8a); }
.zt-menu-divider { height: 1px; margin: 4px 0; background: var(--dsw-alias-border-l1, rgba(128,128,128,.18)); }

/* ---- import banner ---- */
.zt-toast {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3, #1f1f1f);
  color: var(--dsw-alias-label-primary-inverted, #fff);
  font-size: 13px;
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px 0 rgba(0,0,0,.12));
  z-index: 70;
  pointer-events: none;
  animation: zt-toast-in .2s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1));
}
@keyframes zt-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(6px); } }

/* ---- resize handles ---- */
.zt-handle-l { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.zt-handle-br { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; }

/* Narrow viewports: become a near-full-width drawer. */
@media (max-width: 520px) {
  .zt-panel { top: 4px; right: 4px; bottom: 4px; left: 4px; width: auto; min-width: 0; max-width: none; }
  .zt-handle-l { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .zt-panel, .zt-card, .zt-btn, .zt-iconbtn, .zt-progress > i { transition: none; }
  .zt-skeleton { animation: none; }
}
`

function ensureStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.dataset.plugin = '@a9i5k4/dsh-literature'
  tag.dataset.pluginCss = '@a9i5k4/dsh-literature/panel.css'
  tag.textContent = CSS
  document.head.appendChild(tag)
}

function removeStyle() {
  if (typeof document === 'undefined') return
  document.getElementById(STYLE_ID)?.remove()
}

module.exports = { ensureStyle, removeStyle, STYLE_ID }
