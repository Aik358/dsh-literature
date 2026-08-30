import * as pipeline from './pipeline.js'
import * as store from './store/db.js'
import { shortLabel } from './metadata/normalize.js'
import { log, warn } from './log.js'

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

export function registerTools(ctx) {
  const disposers = []

  disposers.push(
    ctx.tools.register({
      name: 'zotero_lookup',
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
        const lines = items.filter(Boolean).map((i) => `- ${i.record?.title || i.display} [${i.key}]`)
        return `已加入侧窗 ${items.length} 条：\n${lines.join('\n')}`
      },
    }),
  )

  disposers.push(
    ctx.tools.register({
      name: 'zotero_save',
      description: '把侧窗中已识别的文献保存到本地 Zotero 库或导出目录（会自动下载全文 PDF）。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '条目 key（来自 zotero_lookup 的返回）' },
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
          return `已保存：${shortLabel(item.record ?? {})}（${item.saveMode === 'dir' ? item.export?.pdfPath : 'Zotero 库'}）`
        }
        return `保存失败：${item.error?.message ?? '未知错误'}（${item.error?.code ?? 'unknown'}）`
      },
    }),
  )

  log('tools registered: zotero_lookup, zotero_save')
  return disposers
}
