/**
 * Scholar profile — an implicit model of the user's academic background,
 * pragmatics and preferences, distilled from what the plugin already observes.
 *
 * Design principles (from the profiling literature, see SCHOLAR-PROFILE.md):
 * - IMPLICIT over explicit: derive from behaviour (deepread cards, notes,
 *   citation calls, queries), never interrogate the user.
 * - EVIDENCE-CARRYING: every profile entry keeps the item keys that support
 *   it, so the user can audit where a claim came from — and override it.
 * - DISTILLED BY AI, STORED LOCALLY: counters live in profile.json; the prose
 *   profile (what actually gets injected into memory) is written by the model
 *   via literature_profile(action='save') and mirrored to dsh-auto-memory's
 *   user memory only when the user asks for it.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { STORE_DIR } from './config.js'

const PROFILE_PATH = join(STORE_DIR, 'scholar-profile.json')
const PROFILE_MD_PATH = join(STORE_DIR, 'scholar-profile.md')

const EMPTY = {
  version: 1,
  updatedAt: 0,
  // topic -> { weight, evidence: [itemKey] } — raised by deepread cards,
  // saves, notes. Weight is a simple counter; ranking normalises it.
  topics: {},
  // methodology affinity: experiment / theory / engineering / review
  methods: {},
  // citation format usage counters: apa / gb / mla / chicago / bibtex
  citationStyles: {},
  // search query log (capped): what the user asks for, verbatim
  queries: [],
  // canonical term -> accepted variants (from notes/deepread language)
  terminology: {},
  // pragmatics observed from query & note text
  pragmatics: { language: '', avgNoteLen: 0, noteCount: 0 },
  // free-form notes the user explicitly adds about themselves
  selfDeclared: '',
}

let state = null
let saveTimer = null

async function load() {
  if (state) return state
  try {
    state = { ...structuredClone(EMPTY), ...JSON.parse(await readFile(PROFILE_PATH, 'utf8')) }
  } catch {
    state = structuredClone(EMPTY)
  }
  return state
}

async function persist() {
  await mkdir(dirname(PROFILE_PATH), { recursive: true })
  await writeFile(PROFILE_PATH, JSON.stringify(state, null, 2), 'utf8')
}

function schedulePersist() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    persist().catch(() => {})
  }, 800)
  saveTimer.unref?.()
}

function bump(map, key, by = 1) {
  if (!key) return
  map[key] = (map[key] ?? 0) + by
}

/* ------------------------------------------------------------- collection */

export async function recordCite(style) {
  const s = await load()
  bump(s.citationStyles, String(style ?? 'apa').toLowerCase())
  s.updatedAt = Date.now()
  schedulePersist()
}

export async function recordQuery(query) {
  const s = await load()
  s.queries.unshift({ q: String(query ?? '').slice(0, 120), at: Date.now() })
  if (s.queries.length > 100) s.queries.length = 100
  s.updatedAt = Date.now()
  schedulePersist()
}

export async function recordNote(key, note) {
  const s = await load()
  const text = String(note ?? '')
  // Pragmatics signals from the user's own words.
  s.pragmatics.noteCount += 1
  s.pragmatics.avgNoteLen = Math.round((s.pragmatics.avgNoteLen * (s.pragmatics.noteCount - 1) + text.length) / s.pragmatics.noteCount)
  s.pragmatics.language = hasCjk(text) ? (/[a-zA-Z]{4,}/.test(text) ? 'zh-en-mixed' : 'zh') : 'en'
  schedulePersist()
}

export async function recordTopic(topic, itemKey) {
  const s = await load()
  const t = String(topic ?? '').trim().slice(0, 60)
  if (!t) return
  const entry = (s.topics[t] = s.topics[t] ?? { weight: 0, evidence: [] })
  entry.weight += 1
  if (itemKey && !entry.evidence.includes(itemKey)) entry.evidence.unshift(itemKey)
  if (entry.evidence.length > 10) entry.evidence.length = 10
  s.updatedAt = Date.now()
  schedulePersist()
}

export async function recordMethod(kind) {
  const s = await load()
  bump(s.methods, String(kind ?? '').toLowerCase())
  schedulePersist()
}

export async function setSelfDeclared(text) {
  const s = await load()
  s.selfDeclared = String(text ?? '').slice(0, 2000)
  s.updatedAt = Date.now()
  await persist()
}

/* --------------------------------------------------------------- distill */

/**
 * The raw material the model distills into the prose profile. Counters and
 * recent queries are facts; the model turns them into a readable profile.
 */
export async function distillMaterial() {
  const s = await load()
  const top = Object.entries(s.topics)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 12)
    .map(([topic, v]) => `${topic}（${v.weight} 次 · 证据：${v.evidence.slice(0, 3).join(', ') || '—'}）`)
  const methods = Object.entries(s.methods).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`)
  const styles = Object.entries(s.citationStyles).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`)
  const queries = s.queries.slice(0, 20).map((q) => `- ${q.q}`)
  return [
    `【画像蒸馏素材】（截至 ${new Date(s.updatedAt ?? Date.now()).toISOString().slice(0, 10)}）`,
    top.length ? `研究主题（按出现频次）：\n${top.map((t) => '- ' + t).join('\n')}` : '研究主题：暂无足够数据',
    methods.length ? `方法论倾向：${methods.join(', ')}` : '方法论倾向：暂无数据',
    styles.length ? `引用格式使用：${styles.join(', ')}` : '引用格式使用：暂无数据',
    `语用观察：语言=${s.pragmatics.language || '未知'}，笔记均长=${s.pragmatics.avgNoteLen} 字，笔记数=${s.pragmatics.noteCount}`,
    queries.length ? `近期检索（反映真实关注点）：\n${queries.join('\n')}` : '近期检索：暂无',
    s.selfDeclared ? `用户自述：${s.selfDeclared}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** The current prose profile, if the model has distilled one. */
export async function profileMarkdown() {
  try {
    return await readFile(PROFILE_MD_PATH, 'utf8')
  } catch {
    return ''
  }
}

export async function saveProfileMarkdown(md) {
  await mkdir(dirname(PROFILE_MD_PATH), { recursive: true })
  await writeFile(PROFILE_MD_PATH, String(md ?? '').slice(0, 8000), 'utf8')
}

function hasCjk(s) {
  return /[\u4e00-\u9fff]/.test(String(s ?? ''))
}
