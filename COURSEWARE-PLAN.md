# COURSEWARE-PLAN — 从文献扩展到课件，以及让 AI 输出示意图

可行性均已在本机实测（不是估算），证据附在每节。

---

## 零、激活策略（沿用并确认）

工具默认**不注册**，只在两个信号下挂载（已实现于 `src/node/activation.js`）：

| 信号 | 机制 |
|---|---|
| 用户打开文献/课件窗格 | 浏览器调 `/api/dsh-literature/activate` → 宿主挂载工具 |
| 用户消息含文献意图 | `ctx.on('session/event')` 取 `user/message` → `detectIntent()` |

词表保守：强信号（文献/论文/DOI/arXiv/组会/综述/BibTeX…）单独命中即激活；
弱信号（搜集/整理/准备）需搭配学术词；**负向词**（报错/编译/部署/commit/refactor…）
出现且不少于强信号时**强制不激活**——避免"修一下引用解析的单元测试"这种
编程语境误触发。空闲 30 分钟自动注销。
课件词（课件/讲义/slide/组会 PPT）并入强信号。

> 写代码时工具根本不在模型可见的工具列表里，从源头不干扰。

---

## 一、PPT/PPTX 解析：Node 零依赖，已实测可行

**实测证据**：对 `三种角色类型分析.pptx` 用 Node 内置 `zlib` 手写的 zip 读取 +
`<a:t>` 文本提取，38 个 entry 全部列出，slide1 中文文本完整抽出（含引号与顿号）。

**结论：不需要任何 npm 依赖。**pptx 本质是 zip + OOXML：

```
pptx ├─ ppt/slides/slideN.xml      ← 正文（<a:t> 段落）+ 备注
     ├─ ppt/notesSlides/notesN.xml ← 讲者备注（课件里常有干货）
     ├─ ppt/media/*                ← 插图（可直接抽出做图表清单）
     ├─ ppt/charts/chartN.xml      ← 图表的**原始数据**（可用来重画示意图！）
     └─ ppt/slideMasters/*         ← 母版（标题层级判断）
```

新模块 `src/node/courseware/pptx.js`（约 150 行）：

| 能力 | 实现 |
|---|---|
| zip 读取 | 手写 End-of-Central-Directory 定位 + central directory 遍历 + `zlib.inflateRawSync`（已验证） |
| 页文本 | `slideN.xml` 里 `<a:t>` 按 `<a:p>` 段落聚合，保留段落顺序 |
| 标题层级 | `<p:ph type="title">` 判标题；字号/占位符类型推断层级 |
| 备注 | `notesSlides/notesN.xml` 同法提取 |
| 插图 | `ppt/media/*` 抽出到库内 `figures/`，记页码与 alt 文本 |
| **图表数据** | `charts/chartN.xml` 的 `<c:cat>`/`<c:val>` 取类别与数值——**这是"重画示意图"的数据源** |

**诚实边界**：老式 `.ppt`（二进制 OLE）无法零依赖解析。遇到时明确提示
"请另存为 .pptx 或 PDF"，不做静默失败。`.pdf` 课件走现有 pdf.js 链路。

---

## 二、AI 输出示意图：完整通路已验证

**实测证据**：`@deepseek-ai/dsh-llm` 的 `ImageBlock { type:'image', attachment }` +
`@deepseek-ai/dsh-attachment` 的 `saveImages([{ data: Uint8Array, mediaType, name }])`
→ 返回 `ImageAttachmentRef`。即：

```js
const [ref] = await ctx.attachments.saveImages([{
  data: new Uint8Array(pngBytes), mediaType: 'image/png', name: 'fig-1.png',
}])
agent.steer(createUserMessage({ content: [
  { type: 'text', text: '依据表 2 数据生成的对比图：' },
  { type: 'image', attachment: ref },
], source: { kind: 'user' } }))
```

限制参数（`imageLimits`）需遵守：`maxImageBytes` / `maxImagesPerMessage` /
`maxMessageImageBytes` / `maxImagePixels` / `maxImageDimension` / 允许的 mediaType
——超限时缩边重压再提交。

### 画图引擎（三级降级）

| 级别 | 方案 | 条件 |
|---|---|---|
| **首选** | Python + matplotlib | 本机 Python **3.14.3 已确认存在**，但 matplotlib **未安装** |
| 兜底 A | 导出 `.py` 脚本 + `.csv` 数据到库目录，提示用户"运行后我再读图" | matplotlib 缺失时 |
| 兜底 B | Node 手写极简 PNG 编码器（zlib deflate + PNG chunk）画柱状/折线 | 质量有限，仅作最后手段 |

**建议做法**：设置页加「示意图引擎」状态卡，检测到缺 matplotlib 时给出
一键命令 `pip install matplotlib`（与 GLM-OCR 的 Key 配置同款交互），
未装前自动走兜底 A 并在回复里说明。不偷偷装包。

### 触发时机（不主动，只在被要求或明显有益时）

- 用户明说"画个图/做个示意图/把数据可视化" → 直接生成
- 深读/总结时检测到**有数据但无可用图**（正文有数值表格、chart XML 有数据、
  但 media 里没有对应清晰插图）→ 在总结末尾**询问**"要不要我根据这些数据画一张？"
  ——**不擅自生成**，符合"不要过于主动"。

### 数据来源优先序

1. `chartN.xml` 的结构化数值（最准）
2. 正文表格（pptx 的 `<a:tbl>` / PDF 表格区）
3. 正文里的数字序列（最不稳，仅当前两者都没有且用户明确要求时用，并标注"数据为手工摘录，请核对"）

---

## 三、课件自动识别文献并归档

流程：`解析课件 → 全文文本 → extractIdentifiers(已有) → 候选条目 → 可选自动入库`

- 复用现有 `src/node/extract/identifiers.js`（DOI/arXiv/PMID/ISBN/标题）
- 新增 `src/node/courseware/cite-scan.js`：从课件参考文献页/正文引用标记
  （`[1]` `(Smith, 2020)`）里抽候选，置信度分级
- **默认只列候选不入库**（与现有 autoScanSession 的默认关闭一致），
  用户在侧窗勾选后入文献库——避免把课件里提到的每篇都灌进库
- 入库条目记 `sourceCourseware: <课件 key>`，形成**课件 ↔ 文献双向链接**：
  看课件时能列出"这页提到的文献"，看文献时能回到"它出现在哪个课件"

## 四、文件夹与归档（导师课件）

- config 增加 `folders: [{ id, name, parentId?, createdAt }]`（支持一层嵌套即可）
- 条目增加 `folderId`（文献与课件共用同一套归档）
- 侧窗顶部加归档切换（全部 / 某文件夹 / 未归档）；拖拽或右键"移入…"
- 与 projects（SCENARIO-PLAN 0.6.x）的关系：**folders 是物理归档，projects 是
  研究主题视图**，两者独立——一个课件可以属于"张老师的课"文件夹，同时参与
  "SSVEP 综述"项目

## 五、课件阅读器

复用现有 PDF 阅读器骨架，增加课件特有面板：

| 面板 | 内容 |
|---|---|
| 页面导航 | slide 缩略图（pptx 用 media 或渲染缩略图；PDF 用现有 thumbs） |
| 大纲 | slide 标题层级（母版占位符推断） |
| 备注 | 讲者备注（课件的隐藏信息金矿） |
| 图表清单 | 本课件所有插图/图表，可点击定位 |
| 知识点 | AI 提炼的知识点卡片（见下） |

## 六、发散：课件还能做什么

1. **知识点卡片**：每页/每节提炼 1–3 个知识点（定义 + 一句话解释 + 出处页码），
   累积成课程知识库，期末复习直接可用
2. **讲义 → 大纲还原**：把一堆 slide 逆推成结构化大纲（章节/要点/术语），
   比逐页读高效得多
3. **术语表**：跨课件聚合专有名词，自动对齐出现位置
4. **课后问题生成**：基于知识点生成自测题（AI 注入对话）
5. **多课件交叉**：同一课程多份课件合并知识点、发现重复与冲突
6. **课件 ↔ 文献互链**（§三）：课件提到的论文一键进库；写作业时反向"这个论点该引哪篇"
7. **组会材料生成**：从项目内文献 + 课件知识点，生成汇报提纲（对应 ZCode 的
   "从模糊想法推演成完整方案 / 生成会议材料"）
8. **打印友好导出**：slide 文本 + 备注 + 图表清单导出 Markdown（带页码）

---

## 七、分期

| 批次 | 版本 | 内容 |
|---|---|---|
| C0 | 0.3.0 | **条件激活**（已完成 activation.js）：意图检测 + 窗格信号 + 工具动态挂载 |
| C1 | 0.3.1 | **PPTX 解析**（pptx.js 零依赖）+ 条目类型扩展为 `paper \| courseware` + 侧窗按类型过滤 |
| C2 | 0.3.2 | **课件阅读器**（缩略图/大纲/备注/图表清单面板） |
| C3 | 0.4.0 | **图表提取 + 示意图生成**（数据抽取 → Python matplotlib → attachments → AI 输出），含三级降级 |
| C4 | 0.4.1 | **文件夹归档** + 课件↔文献双向链接 |
| C5 | 0.5.0 | 知识点卡片 / 术语表 / 组会材料（配合深读管线与摘要卡） |

## 八、风险与边界

| 风险 | 缓解 |
|---|---|
| pptx 结构变体（WPS/Keynote 导出） | 解析器对缺失部件全部容错；抽不出文本时明确提示"未能解析该课件" |
| `.ppt` 二进制 | 明确不支持，提示另存为 pptx/pdf |
| matplotlib 未装 | 三级降级，不偷偷装包，回复里说清 |
| 图片超限 | 提交前按 `imageLimits` 缩边重压 |
| 生成图被误当原始数据 | 图下方固定标注"由插件依据 <来源> 生成，非原文插图" |
| 擅自画图干扰用户 | 只在用户要求时生成；总结时最多**询问**一次 |
| 包体积 | pptx 解析纯 Node 内置模块，~150 行，零增量依赖（T11） |
