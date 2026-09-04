/**
 * Built-in reading modes — the "skill" embedded into the plugin.
 *
 * Distilled from community best practice (SNL-UCSB/literature-survey-skill's
 * intent/triage/deepen/synthesize modes, the three-pass reading method, and
 * claim-verification workflows). Each mode is a structured task package the
 * `literature_deepread` tool hands to the model: instructions + fill-in
 * template + exactly the text the pass needs. The model fills the template;
 * nothing here requires a strong model to "just understand" a 60k dump.
 *
 * Pass 1 (triage)  — what is this paper, is it relevant  -> small text budget
 * Pass 2 (deepen)  — claims + evidence audit, per section
 * Pass 3 (precise) — first-principles decomposition, craft, re-implementation
 */

export const READING_MODES = {
  pass1: {
    name: '速读 · 分流',
    textBudgetChars: 12000,
    instructions: [
      '只依据给出的文本（通常是标题/摘要/引言/结论），不要补常识。',
      '按下面的【速读卡】模板逐项填写，每项 1-2 句，不确定就写「文中未提及」。',
      '最后给一个相关性判断：与"我关注的主题"相比，这篇是 高相关 / 一般 / 不相关（说明理由一句话）。',
    ],
    template: [
      '【速读卡】',
      '研究问题：',
      '核心主张（一句话）：',
      '方法概要：',
      '主要结果：',
      '与我的主题的关系：',
      '相关性：高相关 / 一般 / 不相关 — 理由',
    ],
  },
  pass2: {
    name: '深读 · 主张与证据',
    textBudgetChars: 45000,
    instructions: [
      '逐条抽取论文的**可核查主张**（claim），每条必须标注所在章节或页码。',
      '对每条主张做证据审计：证据类型（实验/理论/案例/引用他人）+ 强度（强/中/弱）+ 是否有对照或消融。',
      '列出方法的输入/输出/关键假设；如果换一个数据集或场景，哪些结论可能不成立（方法探测）。',
      '明确区分：作者的实证结果 vs 作者的推测/展望，不要混在一起。',
    ],
    template: [
      '【深读卡】',
      '主张清单（每条：主张 | 出处章节/页 | 证据类型 | 强度 强/中/弱）：',
      '1. ',
      '2. ',
      '方法剖析：输入 → 处理 → 输出；关键假设：',
      '方法探测：如果换数据集/场景，可能失效的是：',
      '实证 vs 推测：',
      '未解决的问题 / 局限：',
    ],
  },
  pass3: {
    name: '精读 · 第一性原理与工艺',
    textBudgetChars: 45000,
    instructions: [
      '第一性原理分解：从四个基础维度拆解这篇工作——状态（它维护什么信息）、时间（何时计算/更新）、协调（模块间如何衔接）、接口（对外暴露什么）。每个维度 1-2 句，便于跨论文比较。',
      '虚拟重实现：回答「如果我从零复现它，核心设计决策有哪几个？最难的是哪一步？」',
      '写作工艺（可选）：用六段公式解剖引言——立意(Stakes) → 问题缺口(Problem Gap) → 关键抽象(Key Abstraction) → 设计直觉(Design Intuition) → 贡献(Contributions) → 结果预览(Results Preview)。',
      '图表清单：列出重要图表与各自支撑的论点；图表缺失或质量差的数据，标注出来（后续可以由插件生成示意图）。',
    ],
    template: [
      '【精读卡】',
      '第一性原理：',
      '  状态：',
      '  时间：',
      '  协调：',
      '  接口：',
      '虚拟重实现：核心决策与最难步骤：',
      '引言工艺（六段）：',
      '重要图表（图表/页码/支撑的论点）：',
      '数据缺失、可生成示意图的位置：',
    ],
  },
}

/**
 * Slices extracted paper text according to a pass's budget. Pass 1 gets the
 * head (title/abstract/intro) plus the tail (conclusion) — the cheapest pages
 * that answer "is this relevant". Passes 2-3 get everything within budget.
 */
export function sliceForMode(text, mode) {
  const s = String(text ?? '')
  const budget = READING_MODES[mode]?.textBudgetChars ?? 45000
  if (s.length <= budget) return s
  if (mode === 'pass1') {
    const head = s.slice(0, Math.floor(budget * 0.75))
    const tail = s.slice(-Math.floor(budget * 0.25))
    return `${head}\n…（中段省略）…\n${tail}`
  }
  return `${s.slice(0, budget)}\n…（超出预算截断）…`
}

/** Builds the instruction package the tool returns to the model. */
export function buildReadPackage(mode, { title, text, figures = [] }) {
  const m = READING_MODES[mode] ?? READING_MODES.pass1
  const lines = [
    `【文献解读任务 · ${m.name}】`,
    `论文：${title}`,
    '',
    '任务要求：',
    ...m.instructions.map((s, i) => `${i + 1}. ${s}`),
    '',
    '输出模板（直接按此结构填写）：',
    ...m.template,
    '',
    figures.length ? '可用图表清单：' : '',
    ...figures.slice(0, 12).map((f) => `  - ${f}`),
    '',
    '— 以下为论文文本 —',
    sliceForMode(text, mode),
  ].filter(Boolean)
  return lines.join('\n')
}
