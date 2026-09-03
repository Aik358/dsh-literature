# ZCODE-ALIGNMENT — 把 ZCode Talent 的愿景坐标系搬到 dsh-literature

ZCode（智谱）给出了 AI 下一阶段的标准答案：**不只能写代码，还能在学术/分析场景里
读完几百页给结论、把数据做成分析、从模糊想法推演成完整方案、生成会议材料。**
dsh-literature 要成为 DeepSeek Harness 在学术文献场景的同位素——AI 学术能力外接，
不是又一个文献管理器。

---

## 一、ZCode 愿景 → dsh-literature 对齐矩阵

| ZCode 的能力 | dsh-literature 对应 | 当前状态 | 版本 |
|---|---|---|---|
| 读完几百页材料给出结论 | **深度阅读管线**（§SCENARIO 场景一）+ 摘要卡 + 页码可溯源 | 待开发 | 0.5.x |
| 把散乱数据做成能看的分析 | `literature_semantic_search` + `literature_get_detail` + 段落级命中 | 待开发 | 0.6.x |
| 从一个模糊想法推演成完整方案 | 写作工作台 + `literature_cite` + `literature_note`；AI 写作前 brainstorm 模式（基于多篇摘要卡生成思路大纲） | 待开发 | 0.4.x + 0.7.x（brainstorm 增量） |
| 一份报告或访谈记录 → 摘要 | AI 注入对话（已有 ai.js）+ 摘要卡生成 | 部分已有 | 0.5.x |
| 数据清洗/计算/交叉验证 → 可复核分析 | **verify_citation 反幻觉** + BibTeX/CSL-JSON/RIS 导出 + 引用交叉核对 | 待开发 | 0.4.x + 0.6.x |
| 基于初步构想推出结构完整方案 | GUIDANCE 引导 AI + 工具族 + 项目化研究笔记 | 待开发 | 0.6.x + 0.7.x |
| 生成格式规整会议材料 | 文献卡片导出 + 引用格式规范化（APA/GB/MLA/Chicago/BibTeX，0.2.11 已修） | 部分已有 | 0.4.x |

**覆盖度：ZCode 列出的七项学术/分析场景，SCENARIO-PLAN 全部覆盖，无遗漏。**

---

## 二、从对齐推导出的三点产品叙事升级

ZCode 不说"我是代码助手"，说"我是 AI 能干的新一类活"。同样，dsh-literature 不该说
"我是 Zotero 侧窗"，而该说"**AI 在学术场景的能力外接**"：

### 2.1 把产品定位从"侧窗 UI"转向"AI 学术能力外接"

- README 第一句从「文献识别→下载→阅读→引用的侧窗插件」改为
  「**让 AI 在学术场景能读、能想、能引用**——文献只是底料，能力才是产品」。
- 卖点不是「不用装 Zotero」，而是「**让你的 DeepSeek 真的会读论文**」。

### 2.2 把"可复核"做成显眼的价值支柱

ZCode 强调"可供复核的分析结果"。文献场景天然有最强溯源——论文每句话都能定位
章节/页码/公式编号。dsh-literature 应当让这一点成为卖相：

- 摘要卡标注「生成时间 + 解析后端 + 章节定位」，用户可编辑覆盖；
- verify_citation 给出 verified / not_found / ambiguous + 原文匹配；
- ask / 总结永远带页码引用；
- AI 引用永远是规范化的（不是「Chen 2023」而是 APA 完整字段）。

### 2.3 从"AI 调用文献"扩到"AI 协助思路组织"

ZCode 提到"从模糊想法推演成完整方案"。当前 SCENARIO-PLAN 的写作工作台偏"调文献"，
**少了 brainstorm 模式**：在用户开写之前，AI 基于项目内 N 篇摘要卡生成"可用的
论证骨架 / 思路大纲 / 待验证假设"——这正是 ZCode 那条能力的学术版。

追加到 0.7.x：工具 `literature_brainstorm({ project, topic, nCards })` → AI 拼装
思路骨架 + 引用锚点。这是"从模糊到完整"的最小可用实现。

---

## 三、产品愿景一句话（中英双语）

### 中文

> **让 DeepSeek 在学术场景能读论文、能想清楚、能写对引用。**
> 读完几百页给出能溯源的结论；把库内文献按你的提问找到并总结；写作时直接用规范引用。
> 不多装一个软件、不多记一条命令，AI 拿到的就是结构化的、能复核的学术底料。

### English

> **Give DeepSeek real academic ability: read papers, think through them, cite properly.**
> From hundreds of pages to a sourceable conclusion. From a vague idea to a defensible outline.
> No new app, no new commands — the AI gets structured, verifiable scholarly material.

---

## 四、README Hero 草案（中英双版，可直接贴）

### 中文 README 顶部

```markdown
## 📚 让 DeepSeek 在学术场景能读、能想、能引用

读完几百页给出**能溯源的结论**（每句话带章节/页码/公式编号），
把库内文献按你的提问**段落级命中**而不是塞整篇全文，
写作时直接插入**规范化的引用**（APA / GB/T / MLA / Chicago / BibTeX）。

> 不是又一个 Zotero 侧窗——是 DeepSeek 在学术场景的能力外接。

### 三件事

1. **AI 真的会读论文**：插件做版面分析与公式/表格定位（默认本地启发式，可选智谱 GLM-OCR 后端），产出结构化骨架；AI 走"分节填空"的两段式阅读，避免把 6 万字一把梭导致幻觉。
2. **AI 真的能找到**：本机嵌入（E5-small q8、dense+lexical 双臂融合）建段落级索引，语义检索"同义改写"问题也能命中；关键词检索保底，删掉模型资产自动降级不残废。
3. **AI 真的会写引用**：AI 在写作时直接调 `literature_cite` 拿到规范引用文本，调 `literature_note` 把"这篇与我写作的关系"沉淀回条目，下次 recall 又命中。

### 联动

- **本机自动记忆（dsh-auto-memory）**：阅读事件转写、关键沉淀由 AI 调 `memory_note_pre` 入笔记。
- **智谱 GLM-OCR（可选）**：自带 API Key 解锁 LaTeX 公式 + 结构化表格级解析，扫描件也能读。
- **完全本地优先**：零云端、零账号、零遥测，GLM-OCR 默认关闭。
```

### English README 顶部

```markdown
## 📚 Give DeepSeek real academic ability — read, think, cite properly

From hundreds of pages to a **sourceable** conclusion (every claim tied to a
section, page, or formula). From a vague question to a **passage-level** hit
in your library — not a 60k-char full-text dump. From an idea to a paper with
**properly formatted** citations (APA / GB/T / MLA / Chicago / BibTeX).

> Not another Zotero sidebar — the academic capability pack for DeepSeek.

### Three things

1. **AI actually reads papers.** The plugin does layout analysis and
   formula/table location (local heuristics by default; optional GLM-OCR
   backend), produces a structured skeleton, then runs a fill-in-the-blank
   per-section read so weak models can't hallucinate on the whole dump.
2. **AI actually finds things.** On-device embedding (E5-small q8,
   dense+lexical fusion), passage-level index so paraphrased queries hit,
   keyword search as fallback, lexical-only degrade mode if model assets go.
3. **AI actually cites properly.** During writing the AI calls
   `literature_cite` for formatted citations and `literature_note` to record
   how a paper relates to your draft — so future recalls hit again.

### Plays well with

- **dsh-auto-memory** (you have it installed): reading events get logged,
  key distillates enter your project notes via `memory_note_pre`.
- **Zhipu GLM-OCR** (optional, your key): LaTeX formulas + table structure,
  scan-only PDFs no longer a dead end.
- **Local-first**: zero cloud, zero account, zero telemetry; GLM-OCR off by default.
```

---

## 五、设置页「关于/愿景」面板结构

新增设置页面板（**首次安装自动展开一次**，用户可手动关闭"下次不再显示"）：

```
┌──────────────────────────────────────────────┐
│  关于文献侧窗                                  │
│                                              │
│  让 DeepSeek 在学术场景能读论文、能想清楚、     │
│  能写对引用。                                  │
│                                              │
│  — 现在就能用                                  │
│  · 选中回复中的 DOI/标题，自动识别入库          │
│  · 划词翻译 / 解释 / 总结（结果回对话）          │
│  · 一键导出 APA/GB/MLA/Chicago/BibTeX         │
│                                              │
│  — 本机已联动                                  │
│  · dsh-auto-memory  ✓  已连接                   │
│  · 智谱 GLM-OCR   ○  未配置（API Key）         │
│                                              │
│  — 路线图                                      │
│  · 深度阅读管线（分节填空，弱模型也能读懂） 0.5.x │
│  · 段落级语义检索 0.6.x                       │
│  · 项目化 + brainstorm 写作 0.7.x             │
│  · 跨文档综述 0.8.x                           │
│                                              │
│  ─────────                                    │
│  [GitHub] [议题] [README] [关闭]               │
└──────────────────────────────────────────────┘
```

联动状态检测：启动时探测 auto-memory（执行 `memory_status_pre` 一次）与
GLM-OCR（探测到 `GLM-OCR_KEY` 配置项即为已连接）。

---

## 六、立即可动的项（与文档版本绑定）

- **本周**：把 README hero 区（中英双版）落进 README.md 与 README_EN.md，
  bump 0.2.12（纯文档 + i18n 词条微调）。
- **下一周**：设置页「关于」面板（settings.cjs 加 view 入口、相关 i18n 词条、
  "下次不再显示"持久化、auto-memory/GLM-OCR 探测状态），bump 0.2.13。
- **0.3.x 起**：按 IMPLEMENTATION-PLANS PART A 顺序推进；0.5.x 落地后本文档的
  对齐矩阵每行补具体 PR 链接，做为对外承诺的"已交付"列。