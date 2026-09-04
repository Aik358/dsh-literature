import * as pipeline from './pipeline.js'
import * as store from './store/db.js'
import { searchItems } from './store/search.js'
import { shortLabel } from './metadata/normalize.js'
import { log, warn } from './log.js'
import { recordCite, recordQuery, recordNote as recordNoteSignal, recordTopic } from './profile.js'
import { writeFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Tools are the primary trigger for this plugin. Scanning model replies after
 * the fact works, but it can't tell a citation in the prose from a paper the
 * model actually retrieved — whereas a tool call is an unambiguous signal.
 */

function textResult(value) {
  return {
    schema: { type: 'string' },
    render: (_args, v) => [{ type: 'text', text: String(v) }],
  }
}

/**
 * Tool definitions. Kept as a factory so the surface can be MOUNTED and
 * UNMOUNTED at runtime — see src/node/activation.js. Tools are absent by
 * default: someone debugging a segfault should never see literature tools in
 * the model's tool list, and a permanent registration costs context on every
 * turn. They appear when the user opens the panel or sends a clearly
 * literature-flavoured message, then retire after an idle timeout.
 */
function toolDefs() {
  return [lookupTool(), searchTool(), getTool(), citeTool(), noteTool(), statusTool(), saveTool(), figureTool(), deepreadTool(), profileTool()]
}

export function registerTools(ctx) {
  let mounted = []

  return {
    mount() {
      if (mounted.length) return
      mounted = toolDefs().map((def) => {
        try {
          return ctx.tools.register(def)
        } catch (e) {
          warn('tool registration failed:', def.name, e?.message)
          return null
        }
      })
      log(`tools mounted: ${toolDefs().map((d) => d.name).join(', ')}`)
    },
    unmount() {
      if (!mounted.length) return
      for (const dispose of mounted) {
        try {
          dispose?.()
        } catch (e) {
          warn('tool dispose failed:', e?.message)
        }
      }
      mounted = []
      log('tools unmounted')
    },
    isMounted: () => mounted.length > 0,
    dispose() {
      this.unmount()
    },
  }
}

/** Formats one search hit compactly — these go straight into model context. */
function formatHit(h) {
  const bits = [h.title]
  if (h.authors) bits.push(h.authors)
  if (h.year) bits.push(String(h.year))
  if (h.container) bits.push(h.container)
  const line = bits.join(' | ') + `  [key=${h.key}]`
  return h.snippet ? `${line}\n    ${h.snippet.slice(0, 160)}` : line
}

const NEXT_STEP = '\n[下一步] literature_get(key=…) 看详情 · literature_cite 生成引用 · literature_search 继续检索'

function lookupTool() {
  return {
    name: 'literature_lookup',
    description:
      '从文本或标识符中识别学术文献（DOI、arXiv ID、PMID、ISBN、标题），解析元数据并生成侧窗条目。当你检索或引用文献并希望用户能在侧边栏预览/保存全文时调用。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '包含文献标识符或引用文本的片段' },
        resolve: { type: 'string', description: '是否立即联网解析元数据，默认 yes' },
      },
      required: [],
    },
    output: textResult(),
    timeoutMs: 120000,
    async execute(args) {
      const text = String(args?.text ?? '')
      if (!text.trim()) return '没有提供文本。'
      const created = await pipeline.scanText(text)
      if (!created.length) return '未识别到新的文献条目（可能已存在于侧窗）。'

      const wantResolve = String(args?.resolve ?? 'yes').toLowerCase() !== 'no'
      if (wantResolve) {
        await Promise.all(created.map((i) => pipeline.resolveItem(i.key).catch((e) => warn('resolve failed', e.message))))
      }
      const items = await Promise.all(created.map((i) => store.getItem(i.key)))
      const lines = items.filter(Boolean).map((i) => `- ${i.record?.title || i.display} [key=${i.key}]`)
      return `已加入侧窗 ${items.length} 条：\n${lines.join('\n')}${NEXT_STEP}`
    },
  }
}

function searchTool() {
  return {
    name: 'literature_search',
    description:
      '在用户的文献库中检索已保存的文献（标题/作者/期刊/摘要/标签的关键词匹配）。当用户问「我之前存的那篇」「我库里有没有讲 X 的」「有什么文献可以用」时调用。返回精简条目，需要完整信息再用 literature_get。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词：主题、标题片段、作者姓氏或期刊名' },
        limit: { type: 'number', description: '返回条数，默认 8，最大 20' },
      },
      required: ['query'],
    },
    output: textResult(),
    timeoutMs: 15000,
    async execute(args) {
      const query = String(args?.query ?? '').trim()
      if (!query) return '缺少检索词。'
      recordQuery(query).catch(() => {})
      const limit = Math.max(1, Math.min(Number(args?.limit) || 8, 20))
      const items = await store.listItems()
      const hits = searchItems(items, query, { limit })
      // Never return an empty body: a blank result invites the model to invent
      // a paper instead of admitting the library has nothing.
      if (!hits.length) return `未在库中找到与「${query}」匹配的条目。可先用 literature_lookup 添加，或换更宽泛的检索词。`
      return `命中 ${hits.length} 条：\n${hits.map((h) => `- ${formatHit(h)}`).join('\n')}${NEXT_STEP}`
    },
  }
}

function getTool() {
  return {
    name: 'literature_get',
    description:
      '按 key 获取条目的完整信息：元数据、摘要、批注与笔记。仅在 literature_search 返回过该 key 时使用——不要凭猜测编造 key。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '条目 key' },
        includeAnnotations: { type: 'boolean', description: '是否包含批注，默认 true' },
      },
      required: ['key'],
    },
    output: textResult(),
    timeoutMs: 15000,
    async execute(args) {
      const key = String(args?.key ?? '')
      if (!key) return '缺少条目 key。'
      const item = await store.getItem(key)
      if (!item) return `未找到条目 ${key}。请先用 literature_search 获取正确的 key。`
      const rec = item.record ?? {}
      const lines = [
        `标题：${rec.title ?? item.title ?? item.display ?? '(无标题)'}`,
        `作者：${(rec.authors ?? []).map((a) => `${a.lastName ?? ''} ${a.firstName ?? ''}`.trim()).filter(Boolean).join('; ') || '—'}`,
        `年份：${rec.year ?? '—'}`,
        `期刊/会议：${rec.container ?? '—'}`,
        `DOI：${rec.doi ?? '—'}`,
        `状态：${item.state ?? '—'}${item.pdf ? '（已有全文）' : '（无全文）'}`,
      ]
      if (rec.abstract) lines.push(`摘要：${String(rec.abstract).slice(0, 600)}`)
      if (String(args?.includeAnnotations ?? true) !== 'false') {
        const anns = await store.getAnnotations(key)
        if (anns.length) {
          const shown = anns.slice(0, 50)
          lines.push(`批注（${anns.length} 条${anns.length > shown.length ? `，展示前 ${shown.length} 条` : ''}）：`)
          for (const a of shown) lines.push(`  - p.${a.pageIndex ?? '?'} ${String(a.text ?? '').slice(0, 120)}${a.note ? ` ｜ 笔记：${String(a.note).slice(0, 120)}` : ''}`)
        }
      }
      return lines.join('\n') + '\n[下一步] literature_cite 生成引用 · literature_note 记录关系'
    },
  }
}

function citeTool() {
  return {
    name: 'literature_cite',
    description:
      '生成规范化的引用文本（APA 7 / GB/T 7714 / MLA 9 / Chicago 17 / BibTeX），支持参考文献条目、文内引用与带页码的直接引用。写作中需要引用文献时直接调用，不要手工拼装作者与年份。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '条目 key' },
        style: { type: 'string', description: 'apa | gb | mla | chicago | bibtex，默认 apa' },
        mode: { type: 'string', description: 'reference（默认）| intext | direct' },
        pages: { type: 'string', description: '直接引用的页码，如 12 或 12-15' },
      },
      required: ['key'],
    },
    output: textResult(),
    timeoutMs: 15000,
    async execute(args) {
      const key = String(args?.key ?? '')
      if (!key) return '缺少条目 key。'
      const item = await store.getItem(key)
      if (!item?.record) return `条目 ${key} 缺少元数据，无法生成引用。请先用 literature_lookup 解析元数据。`
      const { citeDetailed } = await import('./cite.js')
      recordCite(args?.style ?? 'apa').catch(() => {})
      const d = citeDetailed(item.record, {
        style: args?.style ?? 'apa',
        mode: args?.mode ?? 'reference',
        pages: args?.pages,
      })
      return `${d.text}\n（${d.style} · ${d.mode}）\n[下一步] literature_verify 核验引用真实性 · literature_note 记录它和当前写作的关系`
    },
  }
}

function noteTool() {
  return {
    name: 'literature_note',
    description:
      '把一条笔记写回文献条目：这篇文献与用户当前写作/研究的关系、可用论点、待验证之处。会追加保存，下次检索该条目时能被找回。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '条目 key' },
        note: { type: 'string', description: '要记录的笔记内容' },
      },
      required: ['key', 'note'],
    },
    output: textResult(),
    timeoutMs: 15000,
    async execute(args) {
      const key = String(args?.key ?? '')
      const note = String(args?.note ?? '').trim()
      if (!key) return '缺少条目 key。'
      if (!note) return '笔记内容为空，未写入。'
      const item = await store.getItem(key)
      if (!item) return `未找到条目 ${key}。`
      const notes = Array.isArray(item.notes) ? item.notes : []
      // Idempotent: repeating the same note must not pile up duplicates.
      if (notes.some((n) => (typeof n === 'string' ? n : n.text) === note)) return '该笔记已存在，未重复写入。'
      const entry = { text: note, at: new Date().toISOString() }
      await store.patchItem(key, { notes: [...notes, entry] })
      recordNoteSignal(key, note).catch(() => {})
      return `已记录到条目 ${key}（共 ${notes.length + 1} 条笔记）。`
    },
  }
}

function statusTool() {
  return {
    name: 'literature_status',
    description:
      '查看文献库的当前状态：条目总数、各状态分布、最近添加的条目、进行中的任务。在开始文献工作前了解库里有什么时调用。',
    parameters: { type: 'object', properties: {}, required: [] },
    output: textResult(),
    timeoutMs: 15000,
    async execute() {
      const items = await store.listItems()
      const byState = {}
      for (const i of items) {
        const s = i.state ?? 'unknown'
        byState[s] = (byState[s] ?? 0) + 1
      }
      const recent = [...items]
        .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
        .slice(0, 5)
        .map((i) => `- ${i.record?.title ?? i.title ?? i.display ?? '(无标题)'} [key=${i.key}]`)
      const running = (await store.listTasks()).filter((t) => t.status === 'running')
      return [
        `条目总数：${items.length}`,
        `状态分布：${Object.entries(byState).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}`,
        running.length ? `进行中任务：${running.map((t) => `${t.key}(${t.progress ?? 0}%)`).join(', ')}` : '进行中任务：无',
        recent.length ? `最近添加：\n${recent.join('\n')}` : '库是空的。',
      ].join('\n') + NEXT_STEP
    },
  }
}

/**
 * Renders a chart from tabular data via matplotlib (plugin venv) and steers
 * the PNG into the current conversation as text + image blocks. Only runs
 * when the user asks for a figure — never proactively.
 */
function figureTool() {
  const CHART_TYPES = new Set(['bar', 'line', 'pie'])
  return {
    name: 'literature_figure',
    description:
      '根据表格数据绘制示意图并插入当前对话（柱状图/折线图/饼图）。仅在用户明确要求「画个图/可视化/做示意图」时调用；不要在没有数据依据时凭空编造数值。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '图表标题（也会作为消息标题）' },
        categories: { type: 'array', items: { type: 'string' }, description: '横轴类别，如 ["2023","2024","2025"]' },
        series: {
          type: 'array',
          description: '数据系列，每项 { name, values }，values 与 categories 等长',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: 'number' } },
            },
            required: ['name', 'values'],
          },
        },
        chartType: { type: 'string', description: 'bar（默认）| line | pie' },
        caption: { type: 'string', description: '图下说明文字' },
        key: { type: 'string', description: '可选：数据来源条目 key（便于标注出处）' },
      },
      required: ['title', 'categories', 'series'],
    },
    output: textResult(),
    timeoutMs: 120000,
    async execute(args, exec) {
      const title = String(args?.title ?? '').trim() || '示意图'
      const categories = Array.isArray(args?.categories) ? args.categories.map(String) : []
      const series = Array.isArray(args?.series)
        ? args.series
            .map((s) => ({ name: String(s?.name ?? 'series'), values: (Array.isArray(s?.values) ? s.values : []).map((v) => Number(v)) }))
            .filter((s) => s.values.length)
        : []
      const chartType = CHART_TYPES.has(args?.chartType) ? args.chartType : 'bar'
      if (!categories.length || !series.length) return '缺少数据（categories 或 series 为空）。示意图需要真实数据，不能凭空绘制。'

      // 1. Interpreter (venv with matplotlib preferred; system fallback).
      const { figureInterpreter } = await import('./pyenv.js')
      const fig = await figureInterpreter()
      if (!fig || !fig.hasMatplotlib) {
        return '示意图引擎尚未就绪：本机缺少 Python + matplotlib。请在侧窗设置页「示意图引擎」中点击「安装依赖」后重试；期间可以让我输出数据表格代替图表。'
      }

      // 2. Render via a generated script (data inlined as JSON).
      const { mkdtemp: _mk, writeFile: _w, readFile: _r, rm: _rm } = { mkdtemp, writeFile, readFile, rm }
      const dir = await mkdtemp(join(tmpdir(), 'lit-fig-'))
      const pyFile = join(dir, 'fig.py')
      const pngFile = join(dir, 'fig.png')
      const script = [
        "import matplotlib",
        "matplotlib.use('Agg')",
        "import matplotlib.pyplot as plt",
        // CJK glyphs are missing from matplotlib's default font (DejaVu Sans),
        // which turns Chinese labels into tofu boxes. Pick the first installed
        // CJK-capable font; degrade silently on non-CJK systems.
        "from matplotlib import font_manager",
        "_available = {f.name for f in font_manager.fontManager.ttflist}",
        "for _name in ['Microsoft YaHei', 'SimHei', 'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'WenQuanYi Zen Hei']:",
        "    if _name in _available:",
        "        plt.rcParams['font.sans-serif'] = [_name]",
        "        break",
        "plt.rcParams['axes.unicode_minus'] = False",
        `categories = ${JSON.stringify(categories)}`,
        `series = ${JSON.stringify(series)}`,
        `chart_type = ${JSON.stringify(chartType)}`,
        `title = ${JSON.stringify(title)}`,
        "fig, ax = plt.subplots(figsize=(7, 4.2), dpi=150)",
        "if chart_type == 'pie':",
        "    vals = series[0]['values']",
        "    ax.pie(vals, labels=categories, autopct='%1.1f%%', startangle=90)",
        "    ax.axis('equal')",
        "elif chart_type == 'line':",
        "    for s in series: ax.plot(categories, s['values'], marker='o', label=s['name'])",
        "    ax.legend()",
        "else:",
        "    import numpy as np",
        "    x = np.arange(len(categories)); w = 0.8 / max(len(series), 1)",
        "    for i, s in enumerate(series): ax.bar(x + i * w, s['values'], w, label=s['name'])",
        "    ax.set_xticks(x + w * (len(series) - 1) / 2); ax.set_xticklabels(categories)",
        "    ax.legend()",
        "ax.set_title(title)",
        "plt.tight_layout()",
        `plt.savefig(${JSON.stringify(pngFile)})`,
      ].join('\n')
      await writeFile(pyFile, script, 'utf8')
      const { execFile } = await import('node:child_process')
      const run = () => new Promise((resolve) => execFile(fig.exe, [pyFile], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => resolve({ err, stdout, stderr })))
      const r = await run()
      let png = null
      try {
        png = await readFile(pngFile)
      } catch {
        /* render failed */
      }
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      if (!png) return '绘图失败：' + (r.stderr || r.stdout || '未知错误').slice(0, 300)

      // 3. Steer text + image blocks into the current conversation.
      const { sendFigure } = await import('./ai.js')
      const sourceNote = args?.key ? `（数据来源：条目 ${args.key}）` : ''
      try {
        await sendFigure(ctx, { png, title, caption: `${args?.caption ?? ''}${sourceNote}`.trim(), sessionId: exec?.agent?.sessionId ?? null })
        return `示意图「${title}」已生成并插入当前对话。`
      } catch (e) {
        if (e?.code === 'no_session') return '示意图已生成，但当前没有活跃对话可插入。请先打开一个对话再让我画图。'
        return '图片插入对话失败：' + (e?.message ?? '未知错误')
      }
    },
  }
}

/**
 * Hands the model a structured reading package (built-in reading modes,
 * distilled from community literature-survey skills). The model fills the
 * template in its reply; saving is the model's job via literature_note with
 * the matching pass tag, so passes accumulate on the item.
 */
function deepreadTool() {
  const MODES = new Set(['pass1', 'pass2', 'pass3'])
  return {
    name: 'literature_deepread',
    description:
      '启动对某篇文献的结构化解读，返回内置的解读任务包（速读分流 / 深读主张与证据 / 精读第一性原理）。在用户要求「读一下这篇/总结这篇/精读/做文献笔记」时调用。解读完成后用 literature_note(key, 以【速读卡】/【深读卡】/【精读卡】开头的产出) 保存结果。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '条目 key' },
        depth: { type: 'string', description: 'pass1 速读（默认）| pass2 深读主张与证据 | pass3 精读第一性原理' },
      },
      required: ['key'],
    },
    output: textResult(),
    timeoutMs: 30000,
    async execute(args) {
      const key = String(args?.key ?? '')
      if (!key) return '缺少条目 key。'
      const mode = MODES.has(args?.depth) ? args.depth : 'pass1'
      const item = await store.getItem(key)
      if (!item) return `未找到条目 ${key}。请先用 literature_search 获取正确的 key。`
      if (!item.pdf?.path) return `该条目还没有全文 PDF。可先 literature_save(action=fetch) 下载，或对有全文的条目使用本工具。`

      const { extractPdfText } = await import('./pdf-text.js')
      let text = ''
      try {
        text = await extractPdfText(item.pdf.path)
      } catch {
        return '无法解析该 PDF 的文本（文件可能损坏，或是无文本层的扫描件）。'
      }
      if (!text) return '该 PDF 没有可提取的文本（可能是扫描件）。'

      const title = item.record?.title ?? item.title ?? item.display ?? key
      // Figure inventory for pass3 (captions from the deck/chart layer come
      // later; papers rely on the text pass for now).
      const figures = []
      for (const m of text.matchAll(/(?:Fig(?:ure)?|表|Table)\s*\d+[.:：][^\n]{5,90}/g)) {
        if (figures.length < 12) figures.push(m[0].trim())
      }
      recordTopic(title, key).catch(() => {})
      const { buildReadPackage } = await import('./courseware/reading-modes.js')
      const pack = buildReadPackage(mode, { title, text, figures })
      return pack + `\n\n— 解读完成后：literature_note(key, 以【${mode === 'pass1' ? '速读卡' : mode === 'pass2' ? '深读卡' : '精读卡'}】开头的产出) 保存。`
    },
  }
}

/**
 * Scholar profile: view the current model, distill fresh material, or save a
 * newly written prose profile. The distill action returns counters + evidence
 * and asks the model to write the profile in a fixed structure — the model
 * saves with action=save. Nothing is sent anywhere; mirroring into
 * dsh-auto-memory happens only when the user asks for it in chat.
 */
function profileTool() {
  return {
    name: 'literature_profile',
    description:
      '学者画像：查看/蒸馏/保存根据用户文献行为推断的学术背景、语用习惯与偏好。用户问「我的研究画像/我在关注什么/根据我的习惯来」时调用；蒸馏后把画像写回（action=save），并可建议用户同步到 auto-memory。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'view（默认，看当前画像）| distill（取素材并蒸馏）| save（保存蒸馏结果）| self（登记用户自述）' },
        content: { type: 'string', description: 'action=save 时的画像 Markdown；action=self 时的用户自述' },
      },
      required: [],
    },
    output: textResult(),
    timeoutMs: 15000,
    async execute(args) {
      const { distillMaterial, profileMarkdown, saveProfileMarkdown, setSelfDeclared } = await import('./profile.js')
      const action = String(args?.action ?? 'view')
      if (action === 'save') {
        const md = String(args?.content ?? '').trim()
        if (!md) return '缺少画像内容（content）。'
        await saveProfileMarkdown(md)
        return '学者画像已保存。\n[下一步] 用户如需跨会话生效，建议把画像同步到 auto-memory 的用户级记忆（memory_user_pre），或由用户在记忆面板确认。'
      }
      if (action === 'self') {
        await setSelfDeclared(args?.content)
        return '已登记用户自述，下次蒸馏会纳入。'
      }
      if (action === 'distill') {
        const material = await distillMaterial()
        const existing = await profileMarkdown()
        return [
          material,
          '',
          existing ? '【现有画像】\n' + existing : '',
          '',
          '任务：依据素材写一份「学者画像」（Markdown，≤600 字），结构固定为：',
          '## 研究领域（按熟悉度排序）',
          '## 方法论偏好（实验/理论/工程）',
          '## 术语与表达习惯（用户如何称呼概念、中英混用情况）',
          '## 引用习惯（常用格式、语气）',
          '## 当前关注与目标',
          '只依据素材，不推断素材之外的内容；证据不足的维度写「暂无足够数据」。',
          '写完后调用 literature_profile(action=save, content=画像) 保存。',
        ].join('\n')
      }
      const current = await profileMarkdown()
      return current ? '【当前学者画像】\n' + current : '尚无画像。调用 literature_profile(action=distill) 依据行为素材蒸馏一份。'
    },
  }
}

function saveTool() {  return {
    name: 'literature_save',
    description: '把侧窗中已识别的文献保存到本地文献库或导出目录（会自动下载全文 PDF）。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '条目 key（来自 literature_lookup 或 literature_search 的返回）' },
        mode: { type: 'string', description: '保存方式：zotero 或 dir，缺省用配置值' },
        tags: { type: 'string', description: '逗号分隔的标签' },
      },
      required: ['key'],
    },
    output: textResult(),
    timeoutMs: 300000,
    async execute(args) {
      const key = String(args?.key ?? '')
      if (!key) return '缺少条目 key。'
      const tags = String(args?.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const item = await pipeline.saveItem(key, { mode: args?.mode, tags })
      if (!item) return `找不到条目 ${key}。`
      if (item.state === 'saved') {
        return `已保存：${shortLabel(item.record ?? {})}（${item.saveMode === 'dir' ? item.export?.pdfPath : '本地文献库'}）\n[下一步] literature_get 查看详情 · literature_cite 生成引用`
      }
      return `保存失败：${item.error?.message ?? '未知错误'}（${item.error?.code ?? 'unknown'}）`
    },
  }
}
