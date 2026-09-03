# AGENT-API — 让 DeepSeek Agent 能调用文献插件的全部能力

## 问题（实证）

`src/node/routes.js` 暴露 **24 个 HTTP 端点**；`src/node/tools.js` 只注册 **2 个工具**
（`zotero_lookup` / `zotero_save`）。也就是说插件 92% 的能力，**Agent 够不着**：

- 想生成一条规范引用 → 做不到（`cite` 端点无工具）
- 想检索用户已存的库 → 做不到（无 `search_library`）
- 想读一篇论文并总结 → 只能拿到划词注入，无法主动发起
- 想导出 BibTeX / 批量导出 / 管理条目 / 看任务进度 → 全部做不到

愿景里"读完几百页给结论、做分析、推演方案"。能力大半已经在插件里了，
**缺的是把它们开放成 Agent 能调用的工具平面**。本文档就是那份工具平面的完整设计。

---

## 一、工具平面总览（17 个，分四层）

工具数量必须克制：太多会让弱模型选择困难、挤占上下文。设计原则是
**合并同类操作（用 `action` 子命令），而不是一个端点一个工具**。

### 第一层 · 核心 6（常驻，任何场景都先想到它们）

| 工具 | 作用 | 现状 |
|---|---|---|
| `literature_lookup` | 从文本/DOI/arXiv/标题识别文献并入侧窗（可连带解析元数据、下载全文） | 改名自 `zotero_lookup` |
| `literature_search` | **检索库内**：语义 + 关键词双路，段落级命中，每条带摘要卡一句话结论 | 新增 |
| `literature_get` | 取条目详情：元数据 + 摘要卡 + 批注 + 笔记 | 新增 |
| `literature_cite` | 生成规范化引用（APA / GB/T / MLA / Chicago / BibTeX；参考文献 / 文内 / 直接引用带页码） | 新增（复用 `citeDetailed`） |
| `literature_note` | 把笔记/关系写回条目（Agent 沉淀"这篇与我写作的关系"） | 新增 |
| `literature_save` | 保存条目到库 / 下载全文 / 导出到目录 | 改名自 `zotero_save` |

> 这 6 个构成最小闭环：**找到 → 看清 → 引用 → 记住 → 存好**。
> 先落地这 6 个，Agent 就能完成绝大多数文献任务。

### 第二层 · 阅读与分析 5（让 Agent 真的会读）

| 工具 | 作用 |
|---|---|
| `literature_read` | **深度阅读**：解剖 PDF（本地启发式 / 可选 GLM-OCR）→ 分节理解 → 产出摘要卡。长任务，返回 taskId |
| `literature_ask` | 基于某篇（或其命中段落）提问，答案带页码锚点 |
| `literature_annotate` | 加高亮 / 笔记（Agent 标注关键段落，供后续检索） |
| `literature_survey` | 跨文档综述：项目内 N 篇 → 对比表 / 异同 / 时间线 |
| `literature_brainstorm` | 基于项目内摘要卡生成思路骨架 + 引用锚点（ZCode "从模糊想法到完整方案"的学术版） |

### 第三层 · 管理与整理 5

| 工具 | 作用（`action` 子命令） |
|---|---|
| `literature_manage` | `resolve` / `fetch` / `retry` / `discard` / `add-candidate` / `set-tags` |
| `literature_project` | `create` / `list` / `assign`（条目归入项目）/ `notes`（导出研究笔记） |
| `literature_export` | `bibtex` / `ris` / `csl-json` / `notes-md` / `batch` |
| `literature_import` | `drop-pdf` / `scan-dir` / `from-zotero` |
| `literature_status` | 库统计、任务进度（配合 `literature_read` 的长任务）、联动状态（auto-memory / GLM-OCR） |

### 第四层 · 可信度 1

| 工具 | 作用 |
|---|---|
| `literature_verify` | 校验一条引用是否真实存在 → `verified` / `not_found` / `ambiguous` / `offline`，命中时给出规范化的 APA 引用 |

---

## 二、让 Agent "正常调用"的六条工程契约

光有工具不够——弱模型会乱调、会拿超长结果、会编造。这六条是"能正常用"的关键：

### 2.1 每个工具的返回都带「下一步」

返回末尾固定一行，引导 Agent 走完工作流（这是让弱模型能连贯多步调用的核心）：

```
[下一步] literature_get(key=chen2023ssvep) 看详情 · literature_cite 生成引用 · literature_search 继续找
```

### 2.2 严格的体量上限

| 工具 | 上限 |
|---|---|
| `literature_search` | 每条 ≤300 字，最多 20 条 |
| `literature_get` | 摘要卡全量；批注默认 50 条（超了标注"另有 N 条"） |
| `literature_survey` | 每篇 ≤800 字（基于卡，不是原文） |
| `literature_read` | 只返回 taskId 与进度，不返回全文 |

### 2.3 错误语义必须让模型"如实说"

- 找不到 → `未在库中找到匹配条目。`（**禁止返回空串**，否则模型会自己编）
- 无全文 → `该条目尚未下载全文，可先调用 literature_save(action=fetch)。`
- 引用核验失败 → `未找到该文献。请勿引用可能不存在的来源。`
- 离线 → `当前离线，无法核验。`（**不得**伪装成 not_found）

### 2.4 长任务走 taskId + 轮询

`literature_read` / `fetch` / `import` 是耗时操作：立即返回
`{ taskId, status: 'running' }`，Agent 用 `literature_status(taskId=...)` 查进度
（复用现有 SSE / tasks 机制）。**不要**让工具阻塞等待。

### 2.5 幂等

`literature_lookup` 对同一标识符重复调用 → 返回已存在条目（不重复建）；
`literature_note` 同内容重复写 → 去重。

### 2.6 两种交互模式要分清（重要架构澄清）

| 模式 | 场景 | 通道 |
|---|---|---|
| **注入型** | 划词翻译/解释/总结——结果要**展示在对话里给用户看** | 现有 `ai.js` 注入**（保留）** |
| **工具型** | 查库/引用/分析——结果返回**给模型继续推理** | 新增工具平面 |

两者并存，不可混淆：工具型结果不进对话正文，注入型不参与推理。

---

## 三、GUIDANCE（注入系统提示的能力公告，≤400 字）

照 auto-memory 的写法（能力 + 何时用 + 纪律），注册为 `systemPrompt.section`
（静态、字节级稳定，不破前缀缓存）：

```
本机已安装文献插件（dsh-literature）：内置文献库 + PDF 阅读 + 引用生成，
可选联动 dsh-auto-memory 记忆与智谱 GLM-OCR 解析。

用户提到「论文 / 文献 / DOI / arXiv / 引用 / 参考文献 / 我之前读过 / 写东西用什么文献」时：
- 找库里已有的 → literature_search（语义+关键词，段落级命中，带一句话结论）
- 看某篇详情 → literature_get
- 写作时要引用 → literature_cite（直接拿到 APA/GB/MLA/Chicago/BibTeX 规范文本）
- 读一篇并总结 → literature_read（深度阅读，弱模型也不会读偏）
- 核验引用真伪 → literature_verify（生成参考文献前先核验，避免编造）
- 记录关系 → literature_note

纪律：
1. 先 search 再 get 再 cite——不要凭记忆编造库里没有的条目。
2. 生成任何参考文献前，用 literature_verify 核验。
3. 未找到时如实说"库里没有"，不得虚构标题或 DOI。
4. 长任务（read/fetch/import）拿 taskId 后用 literature_status 查，不要阻塞等待。
```

---

## 四、分期落地

| 批次 | 版本 | 内容 | 依赖 |
|---|---|---|---|
| **P0** | **0.3.0** | **核心 6 工具**（lookup 改名 / search / get / cite / note / save 改名）+ `literature_status` + `literature_verify` + GUIDANCE section | A1 改名、A3 检索（关键词版先上） |
| P1 | 0.4.0 | 阅读层 5 工具（read / ask / annotate / survey / brainstorm） | 深读管线 0.5.x、语义层 0.6.x |
| P2 | 0.5.0 | 管理层 5 工具（manage / project / export / import / status 增强） | 项目化 0.6.x |
| P3 | 0.6.0 | 语义检索接入 `literature_search`（双路）、段落级返回 | 语义引擎 0.6.x |

**P0 是杠杆点**：8 个工具（核心 6 + status + verify）落地后，Agent 就能完成
"找文献 → 看清 → 引用 → 核验 → 沉淀"的完整闭环——**愿景里"能写对引用、能找到、
能核验"三项立刻兑现**，不需要等深读管线。

> 与既有文档的关系：本文档是工具平面的**总设计**，取代 IMPLEMENTATION-PLANS
> PART B 的工具清单（B1–B3 被吸收为 `literature_search` / `literature_get` /
> `literature_verify`）；SCENARIO-PLAN 的场景由这些工具承载，
> AI-INTEGRATION 的 L2/L3 由 GUIDANCE 与 status 探测承载。

## 五、验收

- **P0**：Agent 在一段对话里，仅靠工具完成"帮我找库里关于 SSVEP 的文献 →
  给我这条的 APA 引用 → 核验这条引用是否真实 → 记下它和我综述的关系"四连，
  全程零编造（虚构 DOI 即算失败）。
- 工具描述与返回文案双语（跟随宿主语言，复用 i18n 表）。
- 每个工具在 `test-host.mjs` 有注册断言 + 至少一条行为断言。
- 返回体量断言：search 20 条总长 ≤ 6000 字符；get 批注 >50 条时截断且标注。
