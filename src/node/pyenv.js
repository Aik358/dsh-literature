/**
 * Python detection and optional dependency installation, modelled on the
 * dsh-cua-pre plugin's flow (detectPythons with cache -> user clicks
 * "install deps" -> pip install into a plugin-owned venv).
 *
 * Nothing is installed silently and nothing is installed into the user's
 * global site-packages: matplotlib lands in `<plugin-data>/pyvenv` created
 * from a detected interpreter. If the venv bootstrap fails (no venv module,
 * no pip), the figure tool degrades to exporting a ready-to-run .py + .csv.
 */

import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CACHE_MS = 60_000
let cache = { at: 0, pythons: [] }

function run(cmd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout ?? '').trim(), err: String(stderr ?? '').trim(), code: err?.code })
    })
  })
}

/** Interrogate one candidate interpreter: version + venv/pip capability. */
async function probe(exe) {
  const v = await run(exe, ['--version'])
  if (!v.ok) return null
  const cap = await run(exe, ['-c', 'import venv, ensurepip; print("ok")'])
  const mpl = await run(exe, ['-c', 'import matplotlib; print(matplotlib.__version__)'])
  return {
    exe,
    version: v.out.split(' ').pop() ?? '',
    venvCapable: cap.ok,
    hasMatplotlib: mpl.ok,
    matplotlibVersion: mpl.ok ? mpl.out : '',
  }
}

/**
 * Find candidate interpreters (Windows-aware). Cached for a minute; callers
 * pass force=true right after an install to bust it.
 */
export async function detectPythons({ force = false } = {}) {
  if (!force && cache.pythons.length && Date.now() - cache.at < CACHE_MS) return cache.pythons
  const candidates = []
  const tryPush = async (exe) => {
    if (!exe || candidates.some((c) => c.exe === exe)) return
    const p = await probe(exe)
    if (p) candidates.push(p)
  }
  if (process.platform === 'win32') {
    // py launcher enumerates installed interpreters.
    const py = await run('py', ['-0p'])
    if (py.ok) {
      for (const line of py.out.split('\n')) {
        const m = line.match(/[-*]\s*(?:Version: .*)?(?:\|\s*)?(.+\.exe)\s*$/i) ?? line.match(/([A-Za-z]:\\[^\s]+python\.exe)/i)
        if (m?.[1]) await tryPush(m[1].trim())
      }
    }
  }
  await tryPush('python')
  await tryPush('python3')
  if (process.env.WORKBUDDY_PY) await tryPush(process.env.WORKBUDDY_PY)
  const managed = join(homedir(), '.workbuddy', 'binaries', 'python', 'versions')
  if (existsSync(managed)) {
    // WorkBuddy-managed runtimes, newest first.
    try {
      for (const v of readdirSync(managed).sort().reverse()) {
        await tryPush(join(managed, v, 'python.exe'))
        await tryPush(join(managed, v, 'bin', 'python3'))
      }
    } catch {
      /* unreadable dir — ignore */
    }
  }
  cache = { at: Date.now(), pythons: candidates }
  return candidates
}

/** Path of the plugin-owned venv. */
export function venvDir() {
  return join(homedir(), '.dsh', 'dsh-literature', 'pyvenv')
}

function venvPython(dir = venvDir()) {
  return process.platform === 'win32' ? join(dir, 'Scripts', 'python.exe') : join(dir, 'bin', 'python')
}

export function venvExists(dir = venvDir()) {
  return existsSync(venvPython(dir))
}

/**
 * Preferred interpreter for figure rendering: the plugin venv if it exists,
 * else any system python that already has matplotlib.
 */
export async function figureInterpreter() {
  if (venvExists()) {
    const p = await probe(venvPython())
    if (p?.hasMatplotlib) return { ...p, source: 'venv' }
    if (p) return { ...p, source: 'venv', hasMatplotlib: false }
  }
  for (const p of await detectPythons()) {
    if (p.hasMatplotlib) return { ...p, source: 'system' }
  }
  return null
}

/**
 * Create the venv (if needed) and pip-install matplotlib into it. Long-running
 * (~30-90s); the route calling this must tolerate that or run it fire-and-forget.
 */
export async function installFigureDeps(onLog = () => {}) {
  const pythons = await detectPythons({ force: true })
  const base = pythons.find((p) => p.venvCapable)
  if (!base) return { ok: false, error: '未找到可用的 Python（需要带 venv 模块的 Python 3.8+）' }
  const dir = venvDir()
  if (!venvExists(dir)) {
    onLog('创建虚拟环境…')
    const r = await run(base.exe, ['-m', 'venv', dir], { timeout: 120000 })
    if (!r.ok) return { ok: false, error: 'venv 创建失败：' + (r.err || r.out) }
  }
  const py = venvPython(dir)
  onLog('安装 matplotlib…')
  const r = await run(py, ['-m', 'pip', 'install', '--disable-pip-version-check', 'matplotlib'], { timeout: 300000 })
  if (!r.ok) return { ok: false, error: 'matplotlib 安装失败：' + (r.err || r.out).slice(0, 400) }
  cache = { at: 0, pythons: [] }
  return { ok: true, python: py, dir }
}
