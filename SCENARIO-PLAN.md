# SCENARIO-PLAN — 场景能力规划：深读、沉淀、写作

以场景为中心重排中远期计划，整合 `IMPLEMENTATION-PLANS.md` PART B（工具族）、
`AI-INTEGRATION.md`（注入与联动）、`EVOLUTION.md` 阶段 C（综述/脉络）。
触发本规划的三个真实场景：

1. **弱模型读不好论文**：会幻觉、分不出论点、把公式当噪声、不理解内在含义。
2. **读过的东西要能检索**：后续提问时，之前的阅读成果要能被搜出来、用得上。
3. **写作时调文献**：正在写某个东西时，AI 应能说出"你有哪些文献可用"并直接操作。

核心判断：**弱模型的幻觉不是"提示词没写好"，而是"输入没结构"**。把 6 万字原文
一把梭给模型（现状 `ai.js` 的 tldr/ask 就是这么做的），论点-证据-公式-参考文献
全部糊在一起。解法是让**插件做确定性的预加工**（代码解剖论文，不是 AI 解剖），
AI 只对结构化骨架做理解——每一步输入都小而清晰，弱模型也能走得稳。

---

## 场景一：深度阅读管线（Deep Reading，最高优先级）

### 1.1 论文解剖器 —— 双后端 + 统一中间表示

**目标形态**（对标智谱 GLM-OCR `layout_parsing` 接口）：输入 PDF，输出
**结构化 Markdown + JSON**——版面分析 → 区域识别 → 恢复阅读顺序，
给出章节层级、公式（LaTeX）、表格（结构）、图注、参考文献。
0.9B 模型在 OmniDocBench v1.5 得 94.6，公式识别 UniMERNet 96.5、表格 TEDS 93.96——
这就是解剖器应该达到的质量线。

插件的做法是**两个可切换的后端，产出同一套中间表示（IR）**：

```
PDF ─┬─ A) 本地档（默认，零依赖、离线）──┐
     └─ B) GLM-OCR 档（可选，用户自带 Key）┴→ 统一骨架包 IR → 两段式阅读
```

**统一 IR（骨架包 schema，两个后端都必须产出）**：

```json
{
  "sections": [{ "level": 1, "title": "Method", "page": 3, "text": "…", "keySentences": ["…"] }],
  "formulas": [{ "tag": "Eq.(3)", "latex": "…", "page": 5 }],
  "tables":   [{ "caption": "Table 1 …", "page": 6, "html": "…" }],
  "figures":  [{ "caption": "Fig. 1 …", "page": 4 }],
  "references": ["…"],
  "readingOrder": ["sec:intro", "fig:1", "sec:method", "eq:3", "…"],
  "source": { "backend": "local|glm-ocr", "model": "…", "generatedAt": "…", "pages": 12 }
}
```

- **A 档 · 本地**（新增模块 `src/node/analyze/`，零 AI、零依赖）：
  ① 章节树双路径：`doc.getOutline()` 优先（viewer.cjs 已用，node 侧同样可取）；
  outline 缺失时启发式——`pdf-text.js` 目前把 `getTextContent()` 的 items 拍平为字符串，
  **改为保留 item 级信号**（`transform[5]` 纵坐标、`height` 字号、`fontName`），
  按字号突增/居中/编号正则（`^\d+(\.\d+)*\s`、`^\w+\.\s[A-Z]`）切分；
  ② 要点句：段落首尾句 + 信号词句（we propose / we show / however / our results）；
  ③ 公式/图表**定位器**（不是理解器）：fontName 含数学体特征（CMMI/CMSY/Math）
  的连续行、`Fig. 1`/`Figure 1`/`表 1`/`Table 2`/`Eq. (3)` 的 caption 行——
  记录页码与原文；④ 参考文献段切离（幻觉重灾区）。
  质量有限但离线可用，**保证任何时候都有骨架**。

- **B 档 · GLM-OCR**（可选，默认关闭）：设置页新增
  「文档解析后端」+ API Key（与 `unpaywallEmail` 同类的用户自带凭据，
  明文存在本机 config，不上传除该次解析请求外的任何数据）。
  调用 `POST https://open.bigmodel.cn/api/paas/v4/layout_parsing`，
  `model: glm-ocr`，输入 PDF（≤50MB / ≤100 页），取回结构化 Markdown + JSON，
  转换为统一 IR（公式带 LaTeX、表格带 HTML、有阅读顺序）。
  定价约 0.2 元/百万 token（≈1 元 200 份 10 页 PDF），成本可忽略。
  **失败/未配置/离线 → 自动回退 A 档**，用户无感。

> 两个后端产出同一 IR，是这份设计的关键：下游（摘要卡、语义索引、写作调用）
> 完全不关心骨架从哪来，可以今天用本地、明天开 GLM-OCR，也可以按论文难度
> 逐篇选择（双栏/公式密集/扫描件走 B 档，普通单栏走 A 档）。

骨架包缓存于库内 item 级（`analyze` 字段），生成一次反复使用；A2 批注分片落地后
同机制存储。IR 里显式记录 `source.backend` 与生成时间——摘要卡上要能看出
"这份理解基于哪种解析质量"。

> **扫描件的额外收益**：B 档顺带解决 EVOLUTION 2.6 指出的死角——
> 无文本层的扫描 PDF 现在也能得到结构化全文，AI 问答不再静默降质。

### 1.2 两段式阅读（弱模型友好）

替换 `ai.js` 现在的单轮全文注入：

**第一段 · 理解轮**（产摘要卡）：不用"总结这篇论文"，改用**分节填空模板**——
按章节逐个发问，每节只问三件事（这段在做什么/给出了什么证据/结论是什么），
一次只给该节文本 + 该节要点句锚点。输出按固定小节标题书写（**不要求 JSON**，
弱模型输出结构化 JSON 不可靠；按标题行切分解析即可）。全部章节完成后插件把
填空结果组装成**摘要卡**：

```json
{ "problem": "...", "method": "...", "evidence": "...", "findings": [...],
  "limitations": "...", "formulas": [{"tag":"Eq.(3)","page":5,"context":"..."}],
  "figures": [...], "generatedAt": "...", "chapters": [...章节要点...] }
```

摘要卡落盘为 item 的结构化字段，**这就是场景二/三的检索与调用的资产**。

**第二段 · 输出轮**：用户要的"论文总结"基于摘要卡生成（而非原文）。此后该文献的
所有 `ask` 优先检索摘要卡命中的章节，把**相关节原文**（而非全文）给模型——
上下文更短、噪声更少、页码引用更准。

**管线驱动方式**：多轮需要多次"注入对话"——方案为 reader 工具栏新增「深度阅读」
入口，插件按章节序列依次 steer（每轮间隔由 SSE 回执驱动），UI 显示进度
（第 3/7 节）。会话内完成，不打断用户。

### 1.3 公式的诚实边界

不做 OCR、不做公式语义解析（体积与准确率都不现实）。承诺是：**定位、保留原文、
编号引用**。模型输出总结时可以写"作者在 Eq.(3) 处定义了状态转移（见第 5 页）"，
引用清单由解剖器提供原文兜底——用户点开能对上。这是弱模型能力边界内最诚实的做法。

---

## 场景二：语义层与项目化知识层（记忆分项目）

> **修订说明**：原先这里规划的是"关键词倒排索引"。这是重复造轮子且能力不足——
> 本机已有一套成熟的本地语义引擎设计（auto-memory 的 `semantic-js-pre.js`），
> 且用户要的是"语义分析"级别的检索。本节按**同构复用**重写。

### 2.0 语义检索引擎（借鉴 auto-memory，非依赖）

auto-memory 已验证的本地语义方案（`semantic-js-pre.js` 源码实证），
文献插件应实现**同构**的一版（`src/node/semantic/`），而不是另起炉灶：

| 设计点 | auto-memory 的做法 | literature 照做 |
|---|---|---|
| 嵌入模型 | `multilingual-e5-small` ONNX **q8 量化**，384 维，全离线（`env.allowRemoteModels=false`） | 同（中英文论文都覆盖） |
| 前缀约定 | E5 要求 `query: ` / `passage: ` 前缀 | 同（不照做会显著掉点） |
| 双臂融合 | **D6**：dense **0.7** + lexical **0.3**，各自 minmax 归一后融合，排序确定性（平局按 id） | 同权重；词法臂用 BM25-lite 或 TF |
| 加载自检 | 加载后立即编码一次，校验 **维度=384** 且 **模长∈(0.9,1.1)**，失败即 degraded | 同（拒绝坏向量污染索引） |
| 优雅降级 | 模型资产缺失 → 回退纯词法（C1），功能不残废 | 同 |
| 索引重建 | 单飞行 promise（`rebuilding`），避免并发重复建 | 同 |
| peer 依赖 | `@huggingface/transformers` 为**可选 peer**，探测不到则降级 | 同（探测顺序照抄：lib/node_modules → <pkg>/node_modules → 上三级 @huggingface） |

**模型资产可共享**：设置项 `semantic.modelsDir` 允许指向 auto-memory 已下载的
`models/multilingual-e5-small`（省一份 ~120MB 下载）；未配置则用自己的目录。
**运行时不依赖 auto-memory 进程**（它没暴露 service），是"同构 + 可选共享资产"。

**索引粒度是本节的重点**——不是"整篇文献一条向量"（太粗，命中也用不上），
而是**段落级**条目：

| 索引单元 | 内容 | 权重 |
|---|---|---|
| 摘要卡片段 | problem / method / findings / limitations | 3（最有用） |
| 章节要点 | 每个 section 的 keySentences | 2 |
| 元数据 | 标题 / 作者 / 期刊 / 关键词 | 2 |
| 公式/图表 caption | Eq./Fig./Table 的 caption + 上下文 | 2 |
| 用户批注与笔记 | annotation.text + note | 2 |

命中返回**段落级**（含 itemKey + 页码/章节定位），AI 后续提问时插件只把
**命中的那几段**（而非全文/整篇卡）送进上下文——这是"后续提问更好检索"的落地：
更短的上下文 + 更准的出处 + 更低的幻觉。

配套工具：`literature_semantic_search({ query, project?, limit })`——
与 IMPLEMENTATION-PLANS A3 的 `search_library`（关键词）并存：
**关键词检索保底，语义检索提效**，两者都返回同一结构的候选。

### 2.1 数据模型

- config 增加 `projects: [{ id, name, createdAt }]`；item 增加 `projectId`（可空 = 未分组）。
  批量归组：卡片多选 → 移入项目；reader 内"当前项目"指示。
- 摘要卡、批注、笔记天然跟随 item 归属项目。

### 2.2 与 auto-memory 的真实联动通路（修正 AI-INTEGRATION 的判断）

先前文档里"把文献库注册成 auto-memory 语料"的设想**不成立**——
`m4-corpus-pre.js` 的 `buildSourceCatalog` 是**固定三源**
（user / workspace-notes / workspace-log，硬预算 `sources ≤ 3`），
且 `canonicalScopeGuard` 要求 sidecar 与 catalog 完全一致。
外部插件**无法**注册第四源。所以联动只剩三条真实通路：

| 通路 | 机制 | 状态 |
|---|---|---|
| ① 架构同构 + 资产共享 | 语义引擎照抄其设计；`semantic.modelsDir` 可指向它已下载的 E5 模型 | ✅ 可行（§2.0） |
| ② 文献事件写进日志 | 会话内转调 `memory_log_pre`（透传 agent），条目 `[文献] …` | ✅ 可行（AI-INTEGRATION §4.1） |
| ③ **沉淀进 workspace-notes** | 想被 `memory_recall_pre` 语义检索到，内容必须落在**项目笔记 MEMORY.md** | ⚠️ 需走合规路径 |

**③ 为什么重要**：literature 自己写的 `literature/projects/<名>.md` **不会被
memory_recall_pre 检索**（不在三源内）。要让"我读过的论文结论"进入 AI 的记忆检索，
唯一合规位置是 `{ws}/.dsh-memory/MEMORY.md`——而它由 auto-memory 管理、
有每日 3000 字预算与闸门。**结论：不直写它**。改为：

- literature 侧保留自己的项目研究笔记（人可读、可导出、可被自己的语义索引检索）；
- 提供「导出到项目笔记」动作，生成一段**紧凑 Markdown**（每篇 ≤80 字：标题/年份/
  一句话结论/局限），由 **AI 会话内调用 `memory_note_pre` 追加**——
  走 auto-memory 自己的闸门与预算，合规且不撞写；
- 记忆条目统一带项目名前缀，例如 `## 文献 · SSVEP-BCI` 分节，便于 recall 命中与回看。

**分工边界（写进 GUIDANCE，让模型知道该问谁）**：
- 问"我读过/做过什么" → `memory_recall_pre`（记忆 = 经历）
- 问"这篇论文讲了什么/我库里有什么" → `literature_semantic_search` + `literature_get_detail`
  （库 = 结构化资产）
两者各自语义检索，不互相塞数据。

### 2.3 检索过滤

`literature_search_library` 与 `literature_semantic_search` 都支持 `project` 参数；
段落级索引已含摘要卡内容（§2.0 权重表）。
**场景闭环**：读完的论文因为有了摘要卡，"我读过的那篇讲 XX 的"既能被
记忆命中（日志条目带标题/作者/年份）也能被库内语义检索命中（卡内容段落）。

---

## 场景三：写作文献工作台（"我有什么文献可用"）

用户在写东西时对 AI 说"看看我有什么文献可以用"——需要的不是裸元数据列表，
而是**能判断可用性的候选**。工具族在 PART B 基础上按写作场景修订：

| 工具 | PART B 原设计 | 写作场景修订 |
|---|---|---|
| `literature_search_library` | 返回元数据 + snippet | 每条**必带摘要卡一句话结论**（未生成的显示"未深读"，引导用户先跑管线）；支持 `project` 过滤 |
| `literature_get_detail` | 元数据 + 批注 | 增加摘要卡全量（problem/method/findings/limitations）——这是写作时判断"能不能引"的关键 |
| **`literature_cite`（新增）** | 无 | `{ key, style, mode, pages? }` → 格式化引用文本（复用 citeDetailed）。AI 写作时**直接插入规范引用**，不用用户切回侧窗点菜单 |
| **`literature_note`（新增）** | 无 | `{ key, note }` → AI 把"这篇与我正在写的东西的关系"写回条目（追加式 notes 字段，带时间戳）——跨轮次的写作上下文 |

**工作流闭环**：写作 → search（带结论的候选）→ get_detail（判断可引性）→
cite（规范引用直接可用）→ note（关系沉淀）→ 下次写作 recall/search 又命中。
每一步都是弱模型做得好的窄任务，没有一步要求它"理解全文"。

---

## 远期融合（0.8+，基于摘要卡的质变）

- **跨文档综述**：EVOLUTION 3.4 的最大障碍是上下文预算（原文太大）。有了摘要卡，
  综述的输入是"N 张结构化卡"（每张 ~800 字）——10 篇也在预算内，**弱模型可做**。
  工具 `literature_survey({ project, keys?, question })` 返回聚合卡包。
- **研究脉络/周报**：按项目统计（本周深读几篇/各篇结论/批注分布），`literature_report`
  生成；数据全部来自摘要卡与批注，零新增采集。
- **概念脉络**：跨项目聚合摘要卡的 findings 关键词——原 EVOLUTION 3.3，数据源已就绪。

---

## 实施批次

| 批次 | 版本 | 内容 | 依赖 |
|---|---|---|---|
| 0 | 0.3.x | **IMPLEMENTATION-PLANS PART A 全部**（改名/分片/关键词检索/扫描件提示/e2e）——地基 | 无 |
| 1 | 0.4.x | **PART B 工具族**，按 §场景三修订（search 带卡、cite/note 新增） | A3 |
| 2 | 0.5.x | **深读管线 v1 · 本地档**：pdf-text 保留 item 信号 → 本地解剖器 → 统一 IR → 两段式阅读 → 摘要卡存储与 reader 侧「摘要」面板 | A2（分片存储） |
| 2b | 0.5.x | **深读管线 v1 · GLM-OCR 档**：设置页后端选择 + Key、调 `layout_parsing`、Markdown/JSON → IR 转换器、失败回退本地档 | 批次 2 |
| 3 | 0.6.x | **语义层**：E5-q8 引擎（同构 auto-memory，含自检与降级）+ 段落级索引 + D6 双臂融合 + `literature_semantic_search` | A3 关键词兜底 |
| 4 | 0.6.x | **项目化**：projects 数据模型 + UI 分组 + 双检索 project 过滤 + 研究笔记导出（经 `memory_note_pre` 合规入记忆） | 批次 2、3 |
| 5 | 0.7.x | AI-INTEGRATION L2/L3（能力公告 + auto-memory 事件转写，GUIDANCE 写明两插件分工） | A1 改名 |
| 6 | 0.8.x | 远期：survey / report / 概念脉络（基于摘要卡 + 语义检索） | 批次 2、3、4 |

> 原 IMPLEMENTATION-PLANS PART B 的 B1–B3 被吸收进批次 1（带修订）；B4（弹窗发送到对话）
> 并入批次 5。原 AI-INTEGRATION 的批次划分以本表为准；
> AI-INTEGRATION §4.2 的"文件契约"设想作废（见 §2.2 的三源限制）。

## 验收口径（每批）

- **批次 2 / 2b 的硬验收**：对一篇 15 页双栏论文，深读产出的摘要卡中
  （a）章节要点无参考文献混入；（b）每条 finding 可对应到章节/页码；
  （c）公式/图表清单与原文可对上。弱模型（同一模型）对比：直接喂原文的总结
  vs 基于卡的总结，后者事实性错误更少——这是本规划存在的理由，值得做一次
  人工 A/B 记录在 PR 描述里。
  2b 追加：GLM-OCR 档与本地档产出**同一 IR**（字段齐全、可 JSON diff）；
  断网/Key 无效时自动回退本地档且用户无感；IR 的 `source.backend` 正确。
- 批次 1：AI 写作会话里一句话完成"找文献 → 给结论 → 出引用"三连。
- 批次 3：语义检索对"同义改写"查询（如"脑机接口 稳态视觉"→ SSVEP）能命中，
  而关键词检索命中不了；删掉模型资产后自动降级为词法且功能不残废。
- 批次 4：两个项目各自检索互不串扰；研究笔记经 `memory_note_pre` 入记忆后，
  `memory_recall_pre` 能命中论文结论。

## 边界（不做）

- **不做自研公式/版面识别模型**：本地档只做定位与保留；要 LaTeX 级公式与
  结构化表格走 GLM-OCR 档（云端，用户自费、自带 Key、可选）。
- **GLM-OCR 档默认关闭**：不配置 Key 就完全不发外部请求，保持"完全本地"的产品承诺；
  请求体只含该 PDF 本身，上传前在设置页写明这一点。
- 不做自动批量深读（一次一篇，用户发起）——背景静默批量跑既烧钱又不可控。
- 不把摘要卡当真理：卡上标注"生成于 <date> · 由 <模型> 理解轮产出 · 解析后端 X"，
  用户可编辑，编辑即覆盖（用户的话高于模型的话）。
- 不直写 auto-memory 的任何文件：文献事件走会话内 `memory_log_pre` 转写，
  沉淀走 `memory_note_pre` 追加（见 §2.2）——它没暴露 service，corpus 也注册不进去，
  越过闸门直写文件是给自己埋雷。
- 不与 auto-memory 做运行时强耦合：literature 在没有它时必须完整可用
  （语义引擎自带，只是可共享它的模型资产）。
