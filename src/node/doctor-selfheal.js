import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { log, warn } from './log.js'

/**
 * Self-heal for DSH Doctor's supervisor process.
 *
 * `dsh-doctor` provisions its Windows supervisor through
 * `schtasks /Create ... /TR "C:\Users\<name>\AppData\Local\DSH Doctor\supervisor.cmd"`.
 * When the user's path contains SPACES (e.g. "JH Z"), schtasks fails to parse
 * the quoted /TR value and the deployment errors out ("system cannot find the
 * file specified"), leaving `supervisor.token` unprovisioned. The web front-end
 * then polls /api/doctor/status, gets SUPERVISOR_UNPROVISIONED / SUPERVISOR_DOWN,
 * and spins forever on the loading screen.
 *
 * This plugin heals that: while the DSH host is alive it spawns a detached
 * supervisor (the host is the parent process, so the supervisor lives exactly
 * as long as the host — no schtasks involved). The check is idempotent: if the
 * supervisor pipe is already reachable, nothing happens.
 */

function doctorRoot() {
  return process.env.DSH_DOCTOR_HOME?.trim() || join(homedir(), '.dsh-doctor')
}

/** Same derivation as doctor cli.mjs: `dsh-doctor-<sha256(root).slice(0,16)>`. */
export function doctorPipeName(root = doctorRoot()) {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 16)
  return `\\\\.\\pipe\\dsh-doctor-${hash}`
}

/** Probes whether a named pipe currently accepts connections. */
export function pipeAvailable(pipe, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.connect(pipe)
    const t = setTimeout(() => {
      s.destroy()
      resolve(false)
    }, timeoutMs)
    s.on('connect', () => {
      clearTimeout(t)
      s.end()
      resolve(true)
    })
    s.on('error', () => {
      clearTimeout(t)
      resolve(false)
    })
  })
}

/** Locates the dsh-doctor CLI across every profile's node_modules. */
export function findDoctorCli() {
  const profilesDir = join(homedir(), '.dsh', 'profiles')
  let entries = []
  try {
    entries = readdirSync(profilesDir)
  } catch {
    return ''
  }
  for (const name of entries) {
    const candidate = join(profilesDir, name, 'node_modules', '@linxin666', 'dsh-doctor', 'lib', 'cli.mjs')
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/**
 * Ensures a doctor supervisor is running. Called a few seconds after the host
 * starts; spawns only when the supervisor pipe is unreachable.
 */
export async function ensureDoctorSupervisor() {
  try {
    const root = doctorRoot()
    if (await pipeAvailable(doctorPipeName(root))) return
    const cli = findDoctorCli()
    if (!cli) {
      warn('doctor supervisor heal skipped: dsh-doctor CLI not found')
      return
    }
    const child = spawn(process.execPath, [cli, 'supervisor'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, DSH_DOCTOR_HOME: root },
    })
    child.unref()
    log(`doctor supervisor spawned (pid ${child.pid ?? '?'})`)
  } catch (e) {
    warn('doctor supervisor heal failed:', e.message)
  }
}
