# IMPLEMENTATION-PLANS — 补短板（A）与 加杠杆（B）

给执行模型的交接文档。对应 `EVOLUTION.md` 的阶段 A（稳固地基）与阶段 B（让模型会用库）。
功能背景读 `EVOLUTION.md`，通用工作流与陷阱读 `HANDOFF.md` §4/§6（T1–T12 仍然全部有效，
**尤其 T1 反引号、T6 pdf.js 懒加载、T8 i18n、T10 测试隔离**）。

## 执行规则

- **先完成 PART A 的全部任务并发布，再开始 PART B**。B 依赖 A3 的库内检索。
- 每个任务是独立交付单元：完成一个 → 回归全绿 → 单独 commit。禁止把多个任务混在一个提交里。
- 每个任务做完运行：`"C:\Users\JH Z\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" scripts\test-host.mjs` 等全套（见 HANDOFF §4）。
- **不要**顺手重构无关代码。**不要**引入任何新 npm 依赖（T11）。
- 发布节奏：PART A 全部完成后 bump 一次（0.3.0）发布；PART B 完成后 bump 一次（0.4.0）发布。

---

# PART A · 补短板（目标版本 0.3.0）

## A1. 工具改名：`zotero_lookup` / `zotero_save` → 品牌安全名

**背景**：工具名与 description 是模型可见面（进入 function-calling 清单，部分宿主 UI
会直接展示）。品牌要求：可见面不出现 Zotero 商标（技术/同步层内部调用不受限）。

**现状**：
- `src/node/tools.js` 第 24 行附近注册 `zotero_lookup`，第 52 行附近注册 `zotero_save`。
  两处 description 均直接写「Zotero」。

**步骤**：
1. `zotero_lookup` → `literature_lookup`；`zotero_save` → `literature_save`。
2. description 改写：把「本地 Zotero 库」改为「本地文献库」；
   「保存到本地 Zotero 库或导出目录」→「保存到本地文献库或导出目录」。
   **保持 description 的其余行为描述不变**（它们指导模型何时调用）。
3. 全库 grep 验证：`grep -rn "zotero_lookup\|zotero_save" src/ scripts/ README.md README_EN.md`
   —— 必须零命中（README 若提到工具名也要同步改；README 中作为「Zotero 生态/软件本体」
   指代的功能性描述允许保留，但工具名不允许）。
4. `scripts/test-host.mjs` 若断言了工具名，同步更新；并新增一条断言：
   注册的 tools 列表中不存在含 "zotero" 字样的 name。

**不做**：不需要旧名别名。工具清单在宿主每次会话重建时重新注册，模型侧无持久兼容负担。

**验收**：上述 grep 零命中；全套回归绿；工具 description 中英文语境通顺。

## A2. 批注分片存储（消除写入放大）

**背景**：`src/node/store/db.js` 用单 JSON 文件存全部数据。批注（annotations）是唯一
持续增长的部分，每次 flush 都整库序列化；防抖窗口内崩溃会丢批注。

**现状（db.js 关键行）**：
- 第 12 行：`EMPTY = { version: 1, items: {}, tasks: {}, annotations: {}, importedFiles: {} }`
- 第 89 行：`delete s.annotations[key]`（discard 时）
- 第 115 / 123 / 130 / 140 行：annotations 的读、追加、更新、删除。
- 落盘：模块内 `flushTimer` + `writeJsonAtomic`（来自 `../config.js` 第 113 行）。

**目标设计**：批注按 item key 拆分为独立文件：
`<STORE_PATH 同目录>/annotations/<encodedKey>.json`，主库 JSON 不再含 `annotations`。

**步骤**：
1. `db.js` 顶部新增 `ANN_DIR`（基于现有 STORE_PATH 推导，`path.join(path.dirname(STORE_PATH), 'annotations')`，惰性 `mkdir -p`）。
2. 文件名编码：`encodeURIComponent(key)` —— key 可能含空格、中文、斜杠，此编码可逆且文件名安全。
   **读写必须用同一函数**（抽 `annPath(key)`）。
3. 新增内存缓存 `const annCache = new Map()`（item key → 数组）。读：缓存命中直接返回；
   未命中读分片文件（不存在则 []）。写：更新缓存 + 立即 `writeJsonAtomic(annPath(key), list)`。
4. 把第 115–140 行的四个函数改为走新缓存/分片；对外函数签名与返回值**一个都不能变**。
5. 主库 `EMPTY` 中删除 `annotations`；`load()` 读到旧格式时做一次性迁移：
   旧 `state.annotations` 非空 → 逐 key 写分片 → 主库置空并 flush。迁移代码要幂等
   （重复启动不重复写）。
6. `flush()`（主库）不再覆盖 annotations —— 确认主库 state 里根本没有该字段。

**验收**：
- 新增 test-host 断言：保存批注后，主库 JSON 文件内容 `JSON.parse` 不含 `annotations` 键；
  `<ANN_DIR>/<encoded>.json` 存在且内容正确；重启进程（重新 load）后 `getAnnotations(key)` 返回一致。
- 旧格式迁移：手工构造一个含 annotations 的旧 JSON，启动后自动迁移。

**陷阱**：
- 主库 state 中残留 `annotations: undefined` 会让旧逻辑读到 undefined —— 确保所有读取走新函数。
- `discard`（第 89 行）现在要同时删除分片文件 + 缓存条目。
- 不要用 `key` 直接当文件名（含 `/` 会炸）。

## A3. 库内全文检索（PART B 的地基）

**背景**：现在没有任何库内搜索。条目一多，「我上次存的那篇讲 X 的论文」无法回答。

**目标**：node 侧倒排索引 + `GET /search-library` 路由。

**步骤**：
1. 新文件 `src/node/store/search.js`：
   - `tokenize(text)`：小写化；拉丁文按 `[a-z0-9]+` 切词；CJK 逐字切分（每个汉字是独立 token）。
     返回去重数组。数字串（DOI 片段）保持整串。
   - `indexFrom(items, annotations)`：为每个 item 建索引：
     `title` 权重 3、`authors.lastName/firstName` 权重 2、`container` 权重 2、
     `abstract` 权重 1、该 item 的批注文本权重 1（来自 db.getAnnotations）。
     结构：`Map<token, Map<key, score>>`。
   - `searchLibrary(query, { limit = 20 })`：query tokenize → 各 token 取 posting 求和 →
     按 score 降序 → 返回 `{ key, title, authors, year, container, snippet, score }`。
     `snippet`：abstract 或第一条批注中首个含查询词的句子（≤160 字符，纯文本，不做 HTML）。
   - 失效策略：模块级 `dirty` 标志 + `markIndexDirty()`；db.js 在
     `upsertItem / removeItem / appendAnnotation / updateAnnotation / deleteAnnotation`
     （写路径）末尾调用。首次搜索时惰性重建。**不要**每次写都重建。
2. `routes.js` 新增路由（放在现有只读路由附近，遵守 `methodOk` 模式）：
   `GET /search-library?q=<urlencoded>&limit=` → `writeJson(res, 200, { query, results })`。
   `q` 缺失或全空白 → 400 `{ error: 'missing query', code: 'missingKey' }`。
   `limit` 钳制 1–20。
3. 前端（最小集成）：`SearchBar`（panel.cjs 约 440 行）提交时并行请求
   `api.searchLibrary(q)`，结果作为独立分组「库内结果」渲染在外部候选之上；
   每条可点击 → 选中对应 item（若有）或仅展示。新 api.cjs 方法：
   `searchLibrary: (q, limit = 20) => request('/search-library?q=' + encodeURIComponent(q) + '&limit=' + limit)`。
4. i18n：新增 `search.libraryResults`：zh「库内结果」/ en `Library results`（zh/en 都加，T8）。
5. test-host：新增断言 —— 建两条 item（不同标题），中文与英文 query 各命中正确条目；
   批注文本也能命中；limit 钳制生效。

**验收**：>1000 条目时搜索 <50ms（本地测试可只验证正确性，性能写注释）；
中文单字查询可命中；返回体量 ≤ limit。

**陷阱**：
- snippet 来自用户批注时**必须**原样纯文本（不渲染 Markdown，防注入）。
- 索引失效遗漏是主要 bug 源 —— 写路径五个函数一个都不能漏。

## A4. 扫描件（无文本层）明确提示

**现状**：`src/node/pdf-text.js` `extractPdfText(pdfPath, …)`（第 37 行）抽出文本量极少的
扫描件时，`ai.js` 拿到空上下文 → 模型收到空文档 → 用户得到无意义回答。

**步骤**：
1. `pdf-text.js`：`extractPdfText` 成功后若 `text.replace(/\s+/g, '').length < 120` **且**
   该 PDF 页数 > 3 → `throw Object.assign(new Error('no text layer'), { code: 'noTextLayer' })`。
   双条件防误伤短文（诗歌、幻灯）。页数从 pdfjs doc 拿（该文件内已有 doc 引用）。
2. `ai.js`：调用处 try/catch，命中 `code === 'noTextLayer'` 时向对话注入的指令改为
   「该 PDF 无文本层（扫描件），不支持全文问答；请建议用户使用 OCR 或人工阅读」，
   **不要**把空文本发给模型。
3. 前端 reader：`Reader` 工具栏的 ask / tldr 按钮（panel.cjs）保持可用，但 ai 路由
   返回的提示会经现有 flash/localizeError 显示（无需改前端；确认错误码能落到文案：
   i18n `error.noTextLayer`：zh「该 PDF 是扫描件（无文本层），暂不支持全文问答」/
   en `This PDF is a scan (no text layer) — full-text Q&A is unavailable`）。
4. test-host：构造无文本层 PDF（用 A5 的 fixture 生成器造一个纯图片型或空白 PDF），
   断言 extractPdfText 抛 code。

**验收**：对扫描件，用户在对对话发起全文问答时得到明确的解释性回复。

## A5. 真实 PDF 端到端 smoke（无网络）

**背景**：阅读链路（文本抽取 → 批注 → 导出）只有人工验证。

**步骤**：
1. 新文件 `scripts/make-fixture-pdf.cjs`：手写字节构造一个**最小合法 PDF**（单页，
   含一行可抽取文本 "fixture pdf for e2e smoke"）。可用 pdf.js 的引用库……**不行**，
   不引依赖 —— 手写 PDF 字节（经典做法：对象表 + xref，~1.5KB）。写好后用
   `extractPdfText` 验证能抽出该行文本（这一步本身就是断言）。
2. 新文件 `scripts/e2e-pdf.mjs`：复用 test-host.mjs 的宿主装配方式（T10：DSH_HOME 隔离）——
   importDroppedPdf(buffer) → resolveItem 跳过（无网络）→ extractPdfText 断言文本 →
   annotations 写入/读出 → exporter 导出 RIS 断言字段。
3. `package.json` scripts 增加 `"e2e:pdf": "node scripts/e2e-pdf.mjs"`；
   prepublishOnly **不**加它（fixture 生成慢一次没关系，但保持发布链不变短）。

**验收**：`npm run e2e:pdf` 全绿、零网络。

**陷阱**：手写 PDF 的 xref 偏移量必须精确 —— 生成器里用字节数组拼装并程序化计算偏移，
不要手算数字。

---

# PART B · 加杠杆（目标版本 0.4.0，依赖 A3）

## B1. `search_library` 工具（最高杠杆）

**目标**：模型可检索用户已存文献。这是「模型的长期记忆外挂」的第一步。

**注册 schema（直接照抄）**：
```js
ctx.tools.register({
  name: 'search_library',
  description: '在用户的文献库中检索已保存的学术文献。当用户提到“我之前保存的/我库里
    的某篇论文”或需要引用用户已有文献时调用。返回精简条目；需要完整元数据或批注时
    再调用 literature_get_detail。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '关键词（标题/主题/作者/批注内容）' },
      limit: { type: 'number', description: '返回条数，默认 8，最大 20' },
    },
    required: ['query'],
  },
  output: textResult(),
  timeoutMs: 15000,
  async execute(args) { /* 见下 */ },
})
```

**execute 逻辑**：
1. `const results = await searchLibrary(String(args.query), { limit: clamp(args.limit ?? 8, 1, 20) })`
2. 空结果 → 返回字符串 `'未在文献库中找到匹配条目。'`（**不要返回空串**——模型需要明确信号）。
3. 每条格式化（**硬性限流，防上下文爆炸**）：
   `- {title}｜{authors 前3位, et al.}｜{year}｜{container}｜{snippet ≤200 字符}｜[key={key}]`
4. 末尾固定追加一行：`（需要某条的完整元数据或批注：调用 literature_get_detail，传 key）`。

**步骤**：A3 完成后，在 `tools.js` 注册；`literature_get_detail` 未完成前先引用其名字
（B2 随后实现）。test-host 新增：注册断言（三个新工具名存在）；直接 `import` 搜索模块
断言限流（21 条库只返回 ≤20）。

**陷阱**：description 与注释中不得出现 Zotero（A1 同规则）；返回内容为用户批注时保持
纯文本。

## B2. `literature_get_detail` 与 `literature_list_recent`

**get_item_detail schema**：
```js
{ name: 'literature_get_detail',
  description: '按 key 获取文献完整元数据与批注。仅在 search_library 返回的 key 上使用。',
  parameters: { type: 'object', properties: { key: { type: 'string' }, includeAnnotations: { type: 'boolean', description: '默认 true' } }, required: ['key'] } }
```
**execute**：`store.getItem(key)` 无 record → `'未找到该条目。'`。
输出：标题/作者/年份/期刊/DOI/摘要（≤600 字符）；
批注（includeAnnotations !== false）：按 pageIndex 排序，**最多 50 条**，每条
`p.{pageIndex}：{text ≤120}｜笔记：{note ≤120}`，超出截断并注明“另有 N 条未展示”。

**list_recent schema**：
```js
{ name: 'literature_list_recent',
  description: '列出最近添加或最近阅读的文献（简表）。',
  parameters: { type: 'object', properties: { by: { type: 'string', description: '"added"（默认）或 "read"' }, limit: { type: 'number', description: '默认 8，最大 20' } }, required: [] } }
```
**execute**：`by==='read'` 时按 `item.lastReadAt ?? 0` 降序（若无该字段则回退 added 并在
输出注明）；每条 `- {title}｜{year}｜[key={key}]`。

**陷阱**：detail 中摘要/批注都要限流（数值已给出，照抄）；两工具都只读，绝不触发下载/解析。

## B3. `literature_verify_citation`（反幻觉）

**目标**：模型给出参考文献时校验真伪并回灌权威元数据。

**schema**：
```js
{ name: 'literature_verify_citation',
  description: '校验一条参考文献是否真实存在。输入引用文本或 DOI，返回 verified /
    not_found / ambiguous 及规范化的 APA 引用。生成参考文献前调用可避免编造。',
  parameters: { type: 'object', properties: { citation: { type: 'string', description: '引用文本、DOI 或 arXiv ID' } }, required: ['citation'] } }
```

**execute 步骤**：
1. `extractIdentifiers(citation)`（`src/node/extract/identifiers.js` 第 65 行）拿 DOI/arXiv。
2. 有标识符 → `metadata/index.js` 的解析路径取权威 record；无 → 把整串丢给
   `searchCandidates(query, { rows: 5 })`（`src/node/metadata/search.js` 第 33 行）。
3. 匹配判定（**保守阈值，宁 ambiguous 不误报 verified**）：
   标题归一化 = 小写 + 去所有非字母数字（CJK 保留）；归一化后完全相等 → verified；
   否则若与最优候选的 token 重合率（Jaccard）≥ 0.8 → verified；0.5–0.8 → ambiguous；
   无候选或 <0.5 → not_found。
4. 输出：
   - verified：`已核实。APA 格式：{cite(record,{style:'apa'})}｜DOI: {doi}`
   - ambiguous：`无法确定。最接近的候选：{≤3 条，各含标题+年份+DOI}`，并建议向用户确认
   - not_found：`未找到该文献。请勿引用可能不存在的来源。`（**这句必须原样输出**）
5. 网络异常（searchCandidates 抛错）→ 返回 `status: offline` 文案：`当前离线，无法核验。`
   **不要**伪装成 not_found。

**test-host**：对假 DOI（`10.5555/not-real-key`）断言 not_found 语义（离线环境降级为
offline 文案也算过——断言两种都接受）；对 fixture record 直接构造 + 内部匹配函数单测
（把匹配逻辑抽成 `src/node/metadata/verify.js` 的 `normalizeTitle` / `titleScore`
导出，纯函数可测）。

**陷阱**：searchCandidates 是外部 API，任何调用都要 try/catch；不要缓存校验结果超过
会话期。

## B4.（可选）弹窗加「发送到对话」

`CitationDialog`（`src/client/cite-dialog.cjs`）加一个按钮：把 `detail.text` 经现有
ai 注入通道发进当前会话（复用 `store.askAi` 的会话定位机制，见 store.cjs askAi 注释）。
文案：zh「在对话中使用」/ en `Use in chat`。若无法取到 sessionId 则按钮禁用 + tooltip。
这是纯前端任务，最后做。

---

# 各 PART 完成定义

**PART A（0.3.0）**：
- [ ] A1 grep 零命中；A2 迁移幂等 + 断言过；A3 中英文查询命中 + 五个写路径全部标记 dirty；
      A4 双条件判定 + 明确文案；A5 e2e 零网络绿
- [ ] 全套回归（build/smoke/check-client/check-apply/check-settings/check-i18n/test-host）
- [ ] README.md 与 README_EN.md 特性列表补：库内检索、扫描件提示、（工具名如被提及同步改）
- [ ] bump 0.3.0 → 发布（流程见 HANDOFF §4.3，T7 认证）

**PART B（0.4.0）**：
- [ ] 三个新工具注册 + description 无 Zotero 字样 + 限流数值与本文一致
- [ ] verify 匹配逻辑纯函数化并有单测；offline 降级不冒充 not_found
- [ ] test-host 新增全部断言；全套回归绿
- [ ] README 双语特性列表补「模型可检索你的文献库 / 引用真实性校验」
- [ ] bump 0.4.0 → 发布

**通用红线**（违反任何一条即返工）：
1. 不引入新 npm 依赖。 2. style.cjs 不出现反引号（T1）。 3. zh/en 词条成对加（T8）。
4. node 命令用全路径（T12）。 5. 每任务一提交，提交信息写清根因与行为变化。
