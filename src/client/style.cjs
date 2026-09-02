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
  /* Floating window must sit above the host's main UI. The reference plugin
     (dsh-auto-memory) uses 3000 for its overlay panel — 40 was far too low
     and the host's own layers painted over us. */
  z-index: 3000;
}

.zt-panel[hidden] { display: none; }

/* When embedded as a tab inside dsh-better-sidebar's right panel, the panel
   stops being a floating window and fills its host container. It stays a
   positioning context (relative) AND a stacking context (z-index), so
   panel-scoped children — toasts, resize handles — stack inside the panel
   instead of escaping into the host's layer soup. Anything that must escape
   the panel's overflow (menus, AI bars) is portalled to <body>. */
.zt-panel.zt-panel-embedded {
  position: relative;
  inset: auto;
  width: 100% !important;
  min-width: 0;
  max-width: none;
  height: 100%;
  border: none;
  border-radius: 0;
  box-shadow: none;
  z-index: 1;
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
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Status chips never shrink — they are short and must stay legible. */
.zt-header .zt-badge { flex: 0 0 auto; }

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

.zt-listwrap { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.zt-filterbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  overflow-x: auto;
  scrollbar-width: thin;
}
.zt-chip {
  flex: 0 0 auto;
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #666);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.zt-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-chip-on {
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
/* tag chips on cards (5.8) */
.zt-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.zt-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 4px 0 8px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12));
  color: var(--dsw-alias-label-secondary, #666);
  font-size: 11px;
  max-width: 150px;
}
.zt-tag-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zt-tag-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; padding: 0;
  border: none; border-radius: 3px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 10px;
  cursor: pointer;
}
.zt-tag-x:hover { background: var(--dsw-alias-interactive-bg-active, rgba(128,128,128,.2)); color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-tag-add {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0;
  border: 1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,.3));
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 12px;
  cursor: pointer;
}
.zt-tag-add:hover { color: var(--dsw-alias-brand-primary, #4d6bfe); border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.zt-listbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
}
.zt-selectbar {
  flex: 0 0 auto;
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-2, #fff);
}
.zt-check {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.zt-check input { width: 14px; height: 14px; accent-color: var(--dsw-alias-brand-primary, #4d6bfe); cursor: pointer; }
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

/* flex-wrap so a narrow panel stacks controls instead of squeezing them into
   unreadable slivers — the panel can go down to 280px inside a sidebar. */
.zt-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
@keyframes zt-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.zt-banner {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; font-size: 13px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-state-warn-secondary, rgba(176,96,0,.08));
  color: var(--dsw-alias-state-warn-label, #8a4b00);
  /* min-width:0 lets the text shrink (and wrap) instead of pushing the action
     button out of the panel on narrow layouts. */
  min-width: 0;
}
.zt-banner > span { flex: 1 1 160px; min-width: 0; }
.zt-banner-row { justify-content: space-between; }
.zt-banner-btn { flex: 0 0 auto; height: 24px; padding: 0 10px; font-size: 12px; }

.zt-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); flex: 0 0 auto; overflow-x: auto; scrollbar-width: thin; }
/* Every control keeps its intrinsic width; the toolbar scrolls rather than
   squeezing buttons into unclickable slivers. */
.zt-toolbar .zt-iconbtn,
.zt-toolbar .zt-btn { flex: 0 0 auto; }
.zt-toolbar .zt-input { flex: 0 1 220px; min-width: 140px; }
.zt-input {
  flex: 1 1 auto; min-width: 0; height: 28px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 8px; background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 13px; font-family: inherit;
}

/* ---- reader ---- */
.zt-reader { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base, #fff); }
.zt-reader-scroll { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.zt-page { position: relative; background: #fff; box-shadow: var(--dsw-shadow-lv1, 0 2px 4px 0 rgba(0,0,0,.05)); line-height: 0; }
.zt-page > canvas { display: block; width: 100%; height: auto; }

/* thumbnails sidebar (5.11): fixed-width column, small canvases */
.zt-reader-main { flex: 1 1 auto; min-height: 0; display: flex; }
.zt-thumbs {
  flex: 0 0 84px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  scrollbar-width: thin;
}
.zt-thumb {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1, #fafafa);
  cursor: pointer;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-family: inherit;
  max-width: 100%;
}
.zt-thumb:hover { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.zt-thumb canvas { display: block; width: 62px; height: auto; background: #fff; }

/* mini-markdown in the notes pane (5.12) */
.zt-note-md { color: var(--dsw-alias-label-secondary, #666); }
.zt-note-md code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14));
  font-family: var(--ds-font-family-code, ui-monospace, monospace);
  font-size: 11px;
}

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

/* ---- night reading mode (5.4) ----
   'on' forces the invert; 'auto' follows the host dark theme purely via the
   body[data-ds-dark-theme] attribute the theme runtime toggles (zero JS).
   The hue-rotate keeps colours roughly true; highlights switch to screen
   blending so they stay visible on the inverted surface. */
.zt-page > canvas { transition: filter .2s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1)); }
.zt-reader[data-night-mode='on'] .zt-page { background: #1e1e1e; box-shadow: none; }
.zt-reader[data-night-mode='on'] .zt-page > canvas { filter: invert(0.92) hue-rotate(180deg); }
.zt-reader[data-night-mode='on'] .zt-highlight { mix-blend-mode: screen; }
body[data-ds-dark-theme] .zt-reader[data-night-mode='auto'] .zt-page { background: #1e1e1e; box-shadow: none; }
body[data-ds-dark-theme] .zt-reader[data-night-mode='auto'] .zt-page > canvas { filter: invert(0.92) hue-rotate(180deg); }
body[data-ds-dark-theme] .zt-reader[data-night-mode='auto'] .zt-highlight { mix-blend-mode: screen; }

/* highlight colour palette dots in the selection toolbar (5.3) */
.zt-color-group { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; }
.zt-color-dot {
  width: 16px; height: 16px; padding: 0; margin: 0;
  border: 2px solid var(--dsw-alias-bg-overlay, #fff);
  border-radius: 50%;
  cursor: pointer;
  transition: transform .12s var(--ds-ease-in-out, cubic-bezier(.4,0,.2,1)), box-shadow .12s;
}
.zt-color-dot:hover { transform: scale(1.25); box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(128,128,128,.3)); }
.zt-color-dot[data-color='yellow'] { background: #facc15; }
.zt-color-dot[data-color='green']  { background: #22c55e; }
.zt-color-dot[data-color='blue']   { background: #3b82f6; }
.zt-color-dot[data-color='pink']   { background: #f472b6; }

/* ---- AI assist floating bars & ask box ----
   Portalled to <body> in viewport coordinates (position:fixed) for the same
   reason as the menu: the reader's scroll container clips with overflow:auto,
   so an absolutely-positioned bar anchored inside it gets cut off near the
   edges — and on a narrow panel a 300px bar does not fit at all. Fixed
   positioning makes the bar viewport-sized and never clipped; scrolling closes
   it (see panel.cjs) so it can never drift away from its selection. */
.zt-ai-float {
  position: fixed;
  z-index: 100020;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 16px);
  padding: 4px;
  background: var(--dsw-alias-bg-overlay, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px 0 rgba(0,0,0,.16));
  font-size: 12px;
}
.zt-ai-float-btn {
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f1f1f);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.zt-ai-float-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-ai-float-btn-accent {
  background: var(--dsw-alias-button-primary-fill, #4d6bfe);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.zt-ai-float-btn-accent:hover { background: var(--dsw-alias-button-primary-hover, #3d58e0); }
.zt-ai-float-btn-danger { color: var(--dsw-alias-state-error-primary, #d93025); }
.zt-hl-float-text {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #666);
  padding: 0 6px;
}
.zt-ai-ask {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, #fafafa);
}
.zt-ai-ask .zt-input { flex: 1 1 160px; min-width: 0; }

/* Never shrink used to be the rule here — but outline, search and notes are
   all .zt-toc panes and can be open AT THE SAME TIME (40% + 40% + 25% > 100%),
   which squeezed the reader canvas down to nothing. flex-shrink lets the
   panes share the leftover height instead: the canvas always keeps its share. */
.zt-toc { flex: 0 1 auto; min-height: 0; max-height: 40%; overflow: auto; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18)); padding: 8px; }
.zt-toc button {
  display: block; width: 100%; text-align: left; padding: 4px 8px; margin: 0;
  border: none; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary, #666); font-size: 13px; font-family: inherit; cursor: pointer;
  /* Long outline entries must ellipsize, not stretch the panel. */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.zt-toc button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.zt-toc button[data-depth='1'] { padding-left: 20px; }
.zt-toc button[data-depth='2'] { padding-left: 32px; }
.zt-toc button[data-depth='3'] { padding-left: 44px; }

/* ---- settings ----
   flex + min-height:0 are load-bearing: the panel body is a flex column with
   overflow:hidden, so a page that does not claim the remaining height gets
   sized to its content and its lower half is clipped with no way to scroll to
   it (that is why the bottom of the settings form used to be unreachable). */
.zt-settings { flex: 1 1 auto; min-height: 0; padding: 16px; overflow-y: auto; }
.zt-field { margin-bottom: 16px; }
.zt-field > label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; color: var(--dsw-alias-label-primary, #1f1f1f); }
.zt-field > .zt-hint { margin-top: 4px; }
.zt-field select, .zt-field input[type='text'] {
  width: 100%; box-sizing: border-box; height: 32px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 8px; background: var(--dsw-alias-bg-base, #fff);
  color: var(--dsw-alias-label-primary, #1f1f1f); font-size: 13px; font-family: inherit;
}

/* ---- diff ----
   The table compares long field values; on a narrow panel it must scroll
   horizontally instead of overflowing (and being clipped by the panel). */
.zt-diff { flex: 1 1 auto; min-height: 0; padding: 16px; overflow: auto; }
.zt-diff table { width: 100%; min-width: 320px; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.zt-diff th, .zt-diff td {
  text-align: left; padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  vertical-align: top; overflow-wrap: anywhere;
}
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

/* ---- candidate results (loose search) ---- */
.zt-candidates {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 40%;
  overflow-y: auto;
  padding: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-1, #fafafa);
}
.zt-cand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18));
  background: var(--dsw-alias-bg-layer-2, #fff);
}
.zt-cand:hover { border-color: var(--dsw-alias-border-l2, rgba(128,128,128,.28)); }
/* The text block takes the remaining width and may shrink; the action button
   keeps its size. Without flex:1 here a long title pushed the button out. */
.zt-cand > div { flex: 1 1 auto; min-width: 0; }
.zt-cand-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ---- dropdown menu ----
   Portalled to <body> and positioned in VIEWPORT coordinates (position:fixed):
   anchoring inside the panel meant the panel's own overflow clipped a long
   menu, and siblings could paint over it. Fixed + a far-above-host z-index
   makes it impossible for any host container to clip or cover it. */
.zt-menu {
  position: fixed;
  min-width: 200px;
  max-width: 280px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  background: var(--dsw-alias-bg-layer-2, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.24));
  border-radius: 10px;
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px 0 rgba(0,0,0,.14));
  z-index: 100010;
  display: flex;
  flex-direction: column;
}
/* Placement is fully measured in JS (ui.cjs Dropdown): inline left/top/width/
   maxHeight are set per-open, so there are deliberately no CSS position rules
   here — a leftover right:0 from the absolute era would fight the inline
   geometry on over-constrained layouts. */
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
.zt-menu-item[disabled] { opacity: .45; cursor: default; }
.zt-menu-item[disabled]:hover { background: transparent; }
.zt-menu-icon { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-label-secondary, #666); }
.zt-menu-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zt-menu-hint {
  flex: 0 0 auto;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
}
.zt-menu-divider { height: 1px; margin: 4px 0; background: var(--dsw-alias-border-l1, rgba(128,128,128,.18)); }

/* ---- import banner ---- */
.zt-toast {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: 8px;
  /* Fixed high-contrast colours: the host's own alias values can collapse to
     the same hue on some themes, which rendered the toast text invisible. */
  background: #1f1f1f;
  color: #ffffff;
  font-size: 13px;
  box-shadow: 0 4px 12px 0 rgba(0,0,0,.18);
  /* Panel-scoped: the panel is a stacking context, so a local layer is enough
     and keeps the toast from escaping into the host's z-index space. */
  z-index: 60;
  pointer-events: none;
  max-width: calc(100% - 24px);
  text-align: center;
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

/* ---- Citation dialog ---------------------------------------------------- */
/* Above the portal layer (menus live at 100010): the backdrop must cover
   every dropdown / context menu that could still be open under it. */
.zt-modal-backdrop {
  position: fixed; inset: 0; z-index: 100030;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.42);
  animation: zt-fade-in .12s ease-out;
}
.zt-modal {
  width: min(640px, calc(100vw - 32px));
  max-height: min(80vh, 560px);
  overflow-y: auto;
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1a1a1a);
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.22);
  padding: 14px;
}
.zt-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.zt-tab {
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25));
  background: transparent;
  color: inherit;
  border-radius: 7px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.zt-tab:hover { background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); }
.zt-tab-active, .zt-tab-active:hover {
  background: var(--dsw-alias-bg-brand, #2f6fed);
  border-color: var(--dsw-alias-bg-brand, #2f6fed);
  color: #fff;
}
/* Serif preview: references are read as typeset text, and italics must be
   visible as italics — never as literal asterisks. */
.zt-cite-preview {
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.2));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.05));
  padding: 10px 12px;
  font-family: Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif;
  font-size: 13.5px;
  line-height: 1.65;
  word-break: break-word;
  min-height: 44px;
  display: flex; align-items: center;
}
@keyframes zt-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .zt-modal-backdrop { animation: none; }
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
