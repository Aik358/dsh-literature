/**
 * Tiny Markdown renderer for note text (5.12) — NO library on purpose
 * (bundle-size discipline, T11). Supports exactly **bold**, *italic* and
 * `inline code`, escaping HTML FIRST so nothing injectable ever survives.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * @param {string} text raw note text
 * @returns {string} safe HTML fragment (span-worthy phrasing content)
 */
function renderMiniMd(text) {
  let out = escapeHtml(text)
  // inline code first so its content can contain * and ** untouched
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  // bold before italic; the single-asterisk pass must not touch ** leftovers
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\n])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
  return out
}

module.exports = { renderMiniMd, escapeHtml }
