import { writeSseEvent } from './http.js'
import { warn } from './log.js'

/**
 * Minimal server-sent-event fan-out. The DSH host exposes no general-purpose
 * push channel for plugins (`ctx.remote.$on` has a hard-coded event allow-list
 * and `connection.start` is already owned by the runtime), so the panel gets
 * its progress from a route this plugin owns.
 */

const clients = new Set()

let counter = 0

export function addClient(res) {
  clients.add(res)
  return () => clients.delete(res)
}

export function clientCount() {
  return clients.size
}

export function emit(event, data) {
  counter += 1
  for (const res of clients) {
    if (res.writableEnded || res.destroyed) {
      clients.delete(res)
      continue
    }
    try {
      writeSseEvent(res, counter, event, data)
    } catch (e) {
      warn('sse write failed, dropping client:', e.message)
      clients.delete(res)
    }
  }
}

export function emitItem(item) {
  emit('item', item)
}

export function emitTask(task) {
  emit('task', task)
}

export function emitStatus(status) {
  emit('status', status)
}

/** Heartbeat so proxies and the browser keep the stream alive. */
export function startHeartbeat(intervalMs = 20000) {
  const timer = setInterval(() => {
    for (const res of clients) {
      if (res.writableEnded || res.destroyed) {
        clients.delete(res)
        continue
      }
      try {
        res.write(': keep-alive\n\n')
      } catch {
        clients.delete(res)
      }
    }
  }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}
