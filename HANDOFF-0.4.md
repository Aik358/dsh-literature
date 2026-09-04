# HANDOFF-0.4 — 实现路线交接（给执行模型）

当前基线：**0.3.2 已发布**（GitHub tag v0.3.2 + npm latest）。工具 10 个常驻
（`literature_lookup/search/get/cite/note/status/save/figure/deepread/profile`），
条件激活机制保留但不再 gate 注册（0.3.1 起）。

## 0. 阅读顺序与执行规则

1. 先读 `HANDOFF.md`（§4 工作流、§6 陷阱 T1–T12）——**全部仍然有效**。
2. 再读本文档。功能背景按需查：`SCENARIO-PLAN.md`（场景）、`AGENT-API.md`
   （工具平面六契约）、`COURSEWARE-PLAN.md`（课件）、`AI-INTEGRATION.md`（注入与联动）、
   `ZCODE-ALIGNMENT.md`（叙事）。
3. 执行纪律：一任务一提交；每任务后跑全套回归；不顺手重构；不引入 npm 依赖。

**新增陷阱（本项目 2026-09-03/04 实际踩过，T13 起）：**

- **T13 动态工具注册**：`src/node/tools.js` 的 `toolDefs()` 是唯一工具清单，
  `registerTools(ctx)` 返回 `{mount, unmount}`。`scripts/test-host.mjs` 断言
  `agent tools registered permanently (N)`——**每加一个工具必须同步改 N**。
- **T14 heredoc 变量展开**：往源码追加含 `${}` 的 JS 代码时，bash heredoc 即使
  用引号包裹也可能被展开（pipeline.js 追加失败过）。**追加代码一律用 Edit 工具**。
- **T15 内联替换会清文件**：`node -e` 里 `s.split('a','b')` 的第二参数是 limit
  不是替换串——曾把 i18n.cjs 清成 0 字节（git checkout 救回）。**批量文本替换
  一律用 Edit 工具**；双逗号 bug 同源（原行尾逗号 + 插入逗号）。
- **T16 matplotlib 无 CJK 字形**：默认 DejaVu Sans 中文变方框。`tools.js`
  figureTool 的生成脚本已内置字体挑选（Microsoft YaHei/SimHei/…），**不要删**。
- **T17 图片限制**：`ctx.attachments.imageLimits`（maxImageBytes/Pixels/Dimension/
  maxImagesPerMessage）。`ai.js sendFigure` 已做字节检查；尺寸超限需缩图后再交。

**验证命令**（全绿才算完）：
```
"C:\Users\JH Z\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" build.mjs
…\node.exe scripts\smoke.mjs          # 26 ok
…\node.exe scripts\check-client.mjs   # CLIENT BUNDLE OK
…\node.exe scripts\check-apply.mjs    # APPLY MATRIX ALL PASS
…\node.exe scripts\check-settings.mjs # SETTINGS RENDER TEST ALL PASS
…\node.exe scripts\check-i18n.mjs     # I18N OK（新文案 zh/en 成对，T8）
…\node.exe scripts\test-host.mjs      # HOST TESTS ALL PASS（工具数断言在这里）
```
发布：bump `package.json` + `sed -i` 同步 `src/node/net.js` 的 UA 版本 → build →
commit → push（T7 token 注入）→ tag → `npm publish`（T7）。**push 后必须
`git log/tag` 回查**（0.2.10 曾静默失败）。

---

## 1. 批次 P1（0.3.3）· 三个小而高杠杆的工具

### 1.1 `literature_verify` — 引用真实性核验（反幻觉）

**现状**：无。这是 AGENT-API 第四层唯一未实现的工具。
**步骤**：
1. 新文件 `src/node/metadata/verify.js`，导出纯函数：
   - `normalizeTitle(t)`：小写、去所有非字母数字（CJK 保留）
   - `titleScore(a, b)`：归一化后相等 → 1；否则 Jaccard（token 集合交并比）
2. 在 `tools.js` 的 `toolDefs()` 注册 `literature_verify`：
   - 输入 `{ citation }`（引用文本/DOI/arXiv ID）
   - 先 `extractIdentifiers(citation)`（`src/node/extract/identifiers.js`）拿 DOI/arXiv
   - 有标识符 → `resolveIdentifier`（`src/node/metadata/index.js`）取权威 record
   - 无 → `searchCandidates(citation, { rows: 5 })`（`src/node/metadata/search.js`）
   - 判定（**保守**）：归一化标题相等或 Jaccard ≥ 0.8 → `verified`；
     0.5–0.8 → `ambiguous`（列 ≤3 候选）；< 0.5 或无候选 → `not_found`；
     **任何网络异常 → 返回「当前离线，无法核验」**，绝不冒充 not_found
   - verified 输出附 `citeDetailed(record, {style:'apa'}).text` 作为修正引用
   - not_found 必须原样输出「未找到该文献。请勿引用可能不存在的来源。」
3. test-host：`normalizeTitle` / `titleScore` 单测 + 假 DOI 走 offline 分支。
**验收**：编造的 DOI 得到 not_found 或 offline 文案；真实 DOI 得 verified + 修正引用。

### 1.2 画像驱动的 search 重排序（可解释）

**现状**：`src/node/store/search.js` 的 `searchItems()` 按字段权重打分；
`src/node/profile.js` 已有 `topics`（权重+证据链）。
**步骤**：`searchItems(items, query, { limit, topics })` 增加可选 topics 参数——
命中条目的标题/摘要命中任一画像主题词（`tokenize(topic)` 与条目文本有交集）
则 `score += topics[topic].weight`。`tools.js` searchTool 传入
`(await import('./profile.js')).getTopics()`（需在 profile.js 导出一个只读
`getTopics()`）。命中加权的结果在返回行加标记 `⊙ 因为你常关注「X」`（每条最多一个标记）。
**验收**：两个条目关键词得分相同时，画像主题相关者排前；返回含可解释标记。

### 1.3 `literature_brainstorm` v1（基于 notes 与元数据）

摘要卡（深读管线）还没实现，v1 基于现有数据：项目/全部条目的
`title + year + container + notes`。注册 `literature_brainstorm({ topic, keys? })`：
1. 收集相关条目（keys 或按 topic 用 searchItems）≤12 篇
2. 返回**任务包**（同 deepread 模式）：每篇一行摘要 + 指令——
   「按 论点→支撑文献(key)→反例/局限 的结构生成思路骨架，标注哪些环节证据不足」
3. 提示用户可用 `literature_deepread` 补深读再 brainstorm v2
**验收**：返回包含条目行与任务模板；keys 全部真实存在（不存在则剔除并注明）。

### 1.4 GUIDANCE 更新

`src/node/index.js` 的 systemPrompt section（'dsh:dsh-literature-capabilities'）：
加一行 `- 核验引用真实性 → literature_verify（写参考文献前先核验）`；
brainstorm 上线后加 `- 从模糊想法到方案 → literature_brainstorm`。

---

## 2. 批次 P2（0.4.0）· 课件阅读器 + 归档 + 互链

### 2.1 课件阅读器（文本卡式 v1）

**现状**：`.pptx` 解析结果已存于条目 `courseware` 字段
（`{ format, path, filename, slideCount, aspect, outline:[{index,title}], charts, mediaCount, text }`）。
**关键边界**：零依赖无法把 pptx 渲染成图，v1 是**文本卡式阅读器**（每 slide 一张卡），
不是幻灯片渲染。v2 可选外挂（LibreOffice headless 转 PDF 再走现有 viewer）。
**步骤**：
1. `src/client/panel.cjs` 的 Reader 入口分流：`item.kind === 'courseware'`
   → 新组件 `CoursewareReader`（新文件 `src/client/courseware-reader.cjs`），
   否则走现有 `Reader`。
2. CoursewareReader 布局：左侧 slide 大纲（`courseware.outline`，点击滚动）、
   右侧文本卡（标题 + paragraphs + 备注）+ 图表清单（`courseware.charts`，显示
   categories/series 表格）+「让 AI 画这张图」按钮（调 `literature_figure` 的数据）。
3. 数据来源：`store.getItem(key).courseware`（已持久化），无网络请求。
4. i18n：`courseware.*` 词条 zh/en 成对（T8）。
**验收**：导入的课件能在阅读器里按页浏览文本与备注、图表数据可见。

### 2.2 folders 归档

1. `src/node/config.js` 或 store：`folders` 存 config（`loadConfig().folders ?? []`，
   结构 `{ id, name, parentId?, createdAt }`，一层嵌套）。
2. `item.folderId`（可空）；`literature_manage` 工具加 `action: 'set-folder'`；
   路由 `POST /folders`（create/rename/delete）与 `POST /assign`。
3. 侧窗：filter bar 加归档下拉（全部/各文件夹/未归档），store 加 `folderFilter`；
   卡片右键「移入…」。
4. i18n 成对；test-host：assign 后 `listItems()` 过滤正确。
**验收**：拖入两份课件分入不同文件夹，过滤互不串扰。

### 2.3 课件 ↔ 文献互链

1. 课件导入时（`pipeline.importDroppedCourseware`）对 `courseware.text` 跑
   `extractIdentifiers` → 候选 DOI/arXiv 列表存 `courseware.citedCandidates`。
   **默认不入库**。
2. 新路由 `POST /link-papers`：`{ key(课件), keys(文献) }` → 双向写：
   课件 `courseware.linkedPapers: [keys]`；文献 `sourceCourseware: [coursewareKeys]`。
3. `literature_get` 输出里带 `链接课件：…` / `链接文献：…`。
4. UI（可后置）：课件阅读器图表清单上方显示已链接文献（点击跳卡片）。
**验收**：导入含 DOI 的课件 → candidates 非空；link 后两侧 get 均显示互链。

---

## 3. 批次 P3（0.5.x）· 语义层 + 画像应用

### 3.1 语义引擎（同构 auto-memory，细节见 SCENARIO-PLAN §2.0）

- 新文件 `src/node/semantic/engine.js`：E5-small ONNX q8（384 维），
  `@huggingface/transformers` 作可选 peer（探测顺序照 auto-memory：
  lib/node_modules → <pkg>/node_modules → 上三级 @huggingface），模型目录
  `semantic.modelsDir` 配置可指向 auto-memory 的（`~/…/dsh-auto-memory/…/models/multilingual-e5-small`）。
- **必做契约**：`query: `/`passage:` 前缀；加载自检（dim=384 且 norm∈0.9~1.1，
  失败 → degraded 走词法）；D6 融合 dense 0.7 / lexical 0.3 各臂 minmax；
  单飞行重建。
- 索引单元=段落级（摘要卡字段×3、章节要点×2、元数据×2、caption×2、批注×2）。
- `literature_search` 接双路：语义命中与关键词命中融合排序。
- **降级测试**：删模型资产 → 功能完整、只损失语义召回。
- **体积红线**（T11）：transformers 是 peer 可选依赖，不进 bundle。

### 3.2 画像应用深化

- deepread pass1 的相关性判定模板改为引用画像主题（`buildReadPackage` 加可选
  `profileTopics` 参数）。
- brainstorm v2（摘要卡就绪后）。

---

## 4. 批次 P4（UI 批，可穿插）· 三块缺失的前端

1. **README hero**（`ZCODE-ALIGNMENT.md` §四 已有中英草案，直接贴入
   `README.md` / `README_EN.md` 顶部）——纯文档，随时可做。
2. **设置页「关于」面板**（`ZCODE-ALIGNMENT.md` §五）：首次安装展开一次
   （config 存 `aboutDismissed`）；联动状态探测：auto-memory 用
   `ctx.tools.execute({name:'memory_status_pre'})` try/catch；GLM-OCR 看
   config 是否已配 Key。
3. **示意图引擎状态卡**：后端已就绪（`GET /pyenv`、`POST /install-deps`，
   CUA 式选装）。设置页加卡片：显示 `pythons/figure` 状态 + 「安装依赖」按钮
   （调 install-deps，进度提示，装完刷新）。参照 CUA 的 client.js 387 行
   状态文案模式（`Enabled ✓ (python=…, deps installed)`）。

---

## 5. 明确不做（重申）

- 不自建模型端点；GLM-OCR 档默认关闭、用户自带 Key（`/api/paas/v4/layout_parsing`）。
- 不直写 auto-memory 的文件（corpus 固定三源 `sources≤3`，注册不进去；
  文献事件走会话内 `memory_log_pre` 转写、沉淀走 `memory_note_pre`——都带 agent 才能调）。
- 不做 `.ppt` 二进制解析；不做幻灯片像素渲染（v1 文本卡式）。
- 不做公式 OCR；扫描件承诺 = 明确提示（GLM-OCR 档可解锁）。
- 画像/记忆默认不外传；同步到 auto-memory 必须用户在对话里明确要求。

## 6. 当前文件地图（常改处）

| 文件 | 内容 |
|---|---|
| `src/node/tools.js` | **10 个工具** + `toolDefs()` + `registerTools()`（mount/unmount） |
| `src/node/activation.js` | 意图词表（STRONG/WEAK/NEGATIVE）+ 激活态 |
| `src/node/index.js` | inject 含 systemPrompt；常驻 mount；GUIDANCE section（'dsh:dsh-literature-capabilities'，order 9900） |
| `src/node/routes.js` | `/activate`（head 分支）、`/pyenv`、`/install-deps`、drop 的 pptx 分流 |
| `src/node/pipeline.js` | `importDroppedCourseware`（文件末尾） |
| `src/node/courseware/pptx.js` | PPTX 解析（zip 读取 + slides/media/charts） |
| `src/node/courseware/reading-modes.js` | deepread 三档模板 + `buildReadPackage` |
| `src/node/profile.js` | 画像采集/蒸馏/存取 |
| `src/node/pyenv.js` | Python 探测 + venv 安装 |
| `src/node/store/search.js` | 关键词检索（CJK 二元组） |
| `src/client/panel.cjs` | 过滤（kindFilter）、激活调用（Panel open effect） |
| `scripts/check-i18n.mjs` | zh/en 对齐 + **源码零 CJK 字面量**守卫 |
