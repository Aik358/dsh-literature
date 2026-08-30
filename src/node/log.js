const PREFIX = '[dsh-literature]'

export function log(...args) {
  console.log(PREFIX, ...args)
}

export function warn(...args) {
  console.warn(PREFIX, ...args)
}

export function error(...args) {
  console.error(PREFIX, ...args)
}

/**
 * The plugin shares a process with the whole `dsh web` server, so a stray throw
 * must never be allowed to bubble into the host's own request handling.
 */
export function guard(label, fn) {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (e) {
      error(`${label} failed:`, e && e.stack ? e.stack : e)
      return undefined
    }
  }
}
