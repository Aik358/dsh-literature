/**
 * Tracks the most recently active DSH session so reader AI-assist actions can
 * land in the right conversation. Deliberately ZERO-dependency: this module is
 * imported by the session/event listener, which fires on every chat event —
 * any heavyweight import chain here would block the host's event loop.
 */

let recentSessionId = null

export function noteSession(session) {
  const id = session?.id
  if (id) recentSessionId = String(id)
}

export function recentSession() {
  return recentSessionId
}
