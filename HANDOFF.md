# HANDOFF — dsh-literature 近期功能拓展

> 交接对象：接手实现 `ROADMAP.md`「近期」清单的新会话。本文自包含：读完即可动手，无需追问历史。

## 1. 任务目标

实现 `D:\dsh-zotero\ROADMAP.md` 中「近期」一节的全部 12 项（见 §5 拆解）。按性价比的建议实施顺序：

**第一批（阅读核心）**：阅读位置记忆 → 键盘快捷键 → 高亮颜色自选 → 夜读模式
**第二批（写论文链路）**：BibTeX 输出 → 高亮导出 Markdown → 批量导出
**第三批（库管理）**：标签与过滤 → 排序 → 引用菜单直达
**第四批（可选）**：页面缩略图侧栏、笔记 Markdown 化

每完成一批：跑 §4 回归 → bump 发布（§4.3）。不要攒一个大版本。

## 2. 项目快照

- **是什么**：DSH（DeepSeek Harness）的文献管理插件 `@a9i5k4/dsh-literature`。内置文献库（不依赖 Zotero，Zotero 只是可选导出）+ 侧窗 PDF 阅读器（高亮/笔记/AI 联动）+ 引用生成（APA/GB-T 7714/MLA/Chicago）+ 全文获取（Unpaywall/arXiv/自定义源）。
- **位置**：本地工程 `D:\dsh-zotero`（git main，remote = github.com/Aik358/dsh-literature）。用户通过 junction 装进 DSH：`C:\Users\JH Z\.dsh\profiles\web\node_modules\@a9i5k4\dsh-literature -> D:\dsh-zotero`，**重启 DSH 即加载最新构建**。
- **当前版本**：0.2.7（GitHub + npm 均已发布，tag v0.2.7）。awesome-dsh-plugin 收录 PR #4014 open 中——**不要动那个 fork/分支**。
- **技术栈**：纯 JavaScript（无 TS）。node 侧 ESM（宿主跑），client 侧 CJS（esbuild 打包，React 18 由宿主提供，`react-dom` 可用于 createPortal）。构建器 `build.mjs`（esbuild）。
- **运行时**：node 用 `C:\Users\JH Z\.workbuddy\binaries\node\versions\22.22.2-2\node.exe`（下文简写 `node22`）。Node 22、无 jsdom 之外的重测试框架。

## 3. 架构导览

### 3.1 client 侧（`src/client/*.cjs`，最终打进 `lib/client.js`）
| 文件 | 职责 | 改功能时 |
|---|---|---|
| `panel.cjs` | 全部界面：Panel/ItemList/ItemCard/Reader/SearchBar/PanelHeader/LibraryTab | 大部分 UI 功能在这 |
| `pdf/viewer.cjs` | pdf.js 封装：渲染/缩放/搜索/高亮/选区事件（`emit('selection'|'highlight-click'|'annotation'|'annotations-changed'|'scale')`） | 阅读器交互在这 |
| `store.cjs` | 前端状态机（useSyncExternalStore 模式）：`set/refresh/scanText/resolveItem/fetchPdf/saveItem/citeItem/askAi/ensureEvents...` | 需要新 API 调用先加这 |
| `api.cjs` | loopback fetch 封装（15s 超时已内建）+ `subscribe`（SSE，3 次断线自动降级 15s 轮询） | 新端点在这加一行 |
| `ui.cjs` | Icon/Button/Dropdown（**Portal 到 body**）/Spinner/copyText | 通用组件在这 |
| `style.cjs` | 全部 CSS（一个 JS 模板字符串） | ⚠️ 见 §6 陷阱 T1 |
| `i18n.cjs` | `zh`/`en` 两棵嵌套对象 + `t('a.b.c')` | 任何新文案 zh/en 都要加 |
| `settings.cjs` | 设置页（hooks 必须全部在 early return 之前——React #310 教训） | 加设置项在这 |
| `index.cjs` | apply()：注册 footer/tab/settings、探测 better-sidebar | 入口接线 |

### 3.2 node 侧（`src/node/*.js`，ESM，打进 `lib/index.js`）
- `index.js` apply()：路由注册（webServer prefix `/api/dsh-literature`）、tools、session hook、folder watcher、doctor 自愈
- `routes.js` 全部 HTTP 端点（loopback only）；`pipeline.js` 条目状态机（scan→resolve→fetch→save）；`store/db.js` 持久层（`~/.dsh/storages/dsh-literature/store.json`，结构 `{version, items, tasks, annotations, importedFiles}`，**`patchItem(key, patch)` 是现成的部分更新入口**）
- `cite.js`：`STYLES = { apa, gb, mla, chicago }`，`cite(record, {style, mode, pages})` —— **无 bibtex，要新增**
- `exporter.js`：`cslJson()`/`ris()`（私有）+ `exportToDirectory()` —— **无批量导出，要新增**
- `ai.js`+`pdf-text.js`：AI 联动（宿主 `agent.steer` 注入当前对话）；pdf.js **懒加载**（别改回顶层 import，会阻塞宿主事件循环）
- `metadata/`：crossref/arxiv/openalex/isbn(Open Library)/url 解析；`fetch/pdf.js` 全文获取状态机

### 3.3 数据流（新增功能通常走这条路）
`UI(panel.cjs) → store.cjs action → api.cjs request → routes.js → pipeline/store → SSE 'item'/'task' 推回 → store.set → useStore 重渲染`

## 4. 开发工作流

### 4.1 构建与回归（每次改动后必跑）
```
node22 build.mjs
node22 scripts/smoke.mjs            # 21 断言
node22 scripts/check-client.mjs     # bundle 语法
node22 scripts/check-apply.mjs      # 真实 React 跑 apply
node22 scripts/check-settings.mjs   # 设置页渲染（防 #310）
node22 scripts/test-host.mjs        # 宿主路由 51 断言
```
一键：`npm run prepublishOnly`（= 全链）。

### 4.2 真机验证
`DSH 重启` 后 better-sidebar 文献 tab 生效；宿主日志看 `[dsh-literature]` 前缀。

### 4.3 发布（每批一次）
1. bump：`package.json` version + `src/node/net.js` 的 UA 字符串（`dsh-literature/0.x.y`）
2. `npm run prepublishOnly` 全绿
3. `git add -A && git commit` → push（认证见 §6 T7）→ `git tag vX.Y.Z` → push tag
4. npm：`TOKEN=$(grep -oE "npm_ViUq[A-Za-z0-9]+" "C:/Users/JH Z/.dsh/memory/workspaces/--D--dsh_debug--/memory.md" | head -1)` 然后 `env "npm_config_//registry.npmjs.org/:_authToken=$TOKEN" npm publish --access public --registry=https://registry.npmjs.org`

## 5. 任务拆解

### 5.1 阅读位置记忆
- **做什么**：离开阅读器（切列表/关面板/切 tab）时保存 `{pageIndex, scrollRatio}`；进入时恢复。
- **实现**：node 侧无需新端点——`PATCH /item/:key`（routes.js 已有还是新加？确认；没有就加一个直通 `store.patchItem` 的端点）。client：Reader 卸载 effect 里 `api.patchItem(item.key, { readerProgress: { pageIndex: page, ratio } })`（ratio = scrollTop/scrollHeight）；`createViewer` 成功后 `goToPage(progress.pageIndex+1)` 并恢复滚动。节流：滚动时每 2s 最多写一次，卸载时必写。
- **涉及**：`routes.js`、`api.cjs`、`panel.cjs(Reader)`、`viewer.cjs`。
- **验收**：翻到第 5 页 → 切列表再进 → 回到第 5 页附近；重启 DSH 后仍在。

### 5.2 键盘快捷键
- **做什么**：←/→ 翻页、+/-（含 =）缩放、`/` 聚焦搜索框、Esc 关浮条/搜索。
- **实现**：Reader 挂 `document` keydown（仅 reader 视图激活时），注意 target 是 input/textarea 时跳过。viewer 已有 `goToPage/setScale`。
- **验收**：阅读器内按方向键翻页；输入框打字不受影响。

### 5.3 高亮颜色自选
- **做什么**：划词浮条的「高亮」按钮变为 4 色色板（yellow/green/blue/pink，CSS 已有 `data-color`）。
- **实现**：panel.cjs `highlightSelection` 加 color 参数；浮条里 4 个色点按钮（小圆点，hover 放大）。COLORS 顺序不再自动轮换，改为用户选择（`COLORS` 常量保留作默认）。
- **涉及**：`panel.cjs`、可能 `style.cjs` 加 `.zt-color-dot`。
- **验收**：选色即高亮且刷新后颜色保持（annotations 已持久化 color）。

### 5.4 夜读模式
- **做什么**：宿主暗色主题时 PDF 页面反色（默认跟随，设置页可强制开/关）。
- **实现**：CSS 一条规则 + 一个 data 属性：`.zt-page[data-night='1'] > canvas { filter: invert(0.92) hue-rotate(180deg); }`，`.zt-page[data-night='1'] .zt-highlight { mix-blend-mode: screen; }`。检测宿主主题：看 `document.body` 的 `data-ds-dark-theme` 属性（宿主切主题改它）——用 MutationObserver 或直接 CSS 选择器 `body[data-ds-dark-theme] .zt-page`（**优先纯 CSS**，零 JS）。设置项 `nightMode: 'auto'|'on'|'off'`（settings.cjs + config DEFAULTS）。
- **验收**：暗色宿主下页面可读、高亮仍可见。

### 5.5 BibTeX 输出
- **做什么**：cite.js 加 `bibtex` style；引用菜单加「BibTeX」项。
- **实现**：`STYLES.bibtex = { label: 'BibTeX', format: bibtex }`；`bibtex(record)` 生成 `@article{key,\n author={...}, ...}`（key = `lastNameYear` + title 首词；itemType 映射 article/book/inproceedings）。注意 `mode: 'reference'` 语义即可，intext/direct 对 bibtex 无意义——`cite()` 里对 bibtex 强制 reference。
- **涉及**：`src/node/cite.js`、`panel.cjs citeMenuFor`、`i18n.cjs`。
- **验收**：test-host 加断言（真实 record → 含 `@article{`、author、title、year 字段）；UI 复制出的 BibTeX 能被 JabRef/Overleaf 接受的形态。

### 5.6 高亮导出 Markdown
- **做什么**：阅读器工具栏「导出笔记」→ 复制/下载 `.md`（`## p.12` + `> 原文` + `笔记`）。
- **实现**：node 新端点 `GET /export-notes/:key`（读 store.annotations[key]，组 markdown 字符串）；client 用 copyText 或 Blob 下载。
- **涉及**：`routes.js`、`api.cjs`、`panel.cjs` Reader 工具栏、`i18n.cjs`。
- **验收**：有高亮+笔记的条目导出内容完整、页码正确。

### 5.7 批量导出
- **做什么**：列表多选 → 导出 RIS/BibTeX/CSL-JSON 单文件。
- **实现**：node `POST /export-batch {keys[], format}`（exporter.js 加 `batch(format, records)`；ris/bibtex 直接拼接，cslJson 输出 JSON 数组）。client：ItemList 头部加「选择」模式（卡片复选框 → 底部浮动操作条：全选/取消/导出格式下拉）。
- **涉及**：`exporter.js`、`routes.js`、`api.cjs`、`panel.cjs`、`i18n.cjs`、`style.cjs`。
- **验收**：选 3 条导出 RIS = 3 个 `TY  -` 块。

### 5.8 标签与过滤
- **做什么**：条目可打标签；列表按标签过滤 + 状态过滤（全部/未入库/已入库/失败）。
- **实现**：store 条目已有 `tags`（saveItem 时写 preferredTags）。UI：卡片标签 chip（可增删，`PATCH /item/:key`）；列表顶部过滤行（状态 chips + 标签下拉）。纯前端过滤即可（items 全量在内存）。
- **涉及**：`panel.cjs`、`routes.js`（PATCH 端点，5.1 可能已加）、`style.cjs`、`i18n.cjs`。
- **验收**：打标签后重启仍在；过滤组合正确。

### 5.9 排序
- **做什么**：列表按 添加时间(默认)/标题/年份 排序，记忆选择。
- **实现**：纯前端（`store.set({ sort })` + localStorage 或 config）。标题排序注意 localeCompare('zh')。
- **验收**：三种排序正确、切换即时。

### 5.10 引用菜单直达
- **做什么**：卡片**右键**直接弹引用菜单（现在的 Quote 按钮保留）。
- **实现**：卡片 `onContextMenu` → 复用 Dropdown 的受控打开（Dropdown 需支持 `open`/`onOpenChange` 受控模式或提供 `openAt(x,y)`）。若改动大：做一个小型 `ContextMenu` 组件（同样 Portal + 测量定位，抄 Dropdown 的 place() 逻辑）。
- **验收**：右键卡片出菜单，位置正确、不越界。

### 5.11 页面缩略图侧栏（可选，最后做）
- **做什么**：阅读器左侧缩略图列，点击跳页。
- **实现**：viewer.cjs 复用 `page.render` 低 scale（0.2）渲染到小 canvas；虚拟化（仅渲染可视区±2）防止大 PDF 卡顿。**大 PDF 性能是唯一风险**——首版限制：≤50 页才启用，或滚动懒渲染。
- **验收**：100 页 PDF 不卡；点击跳页准确。

### 5.12 笔记 Markdown 化（可选）
- **做什么**：笔记渲染支持 `**粗体**`/`*斜体*`/行内代码。
- **实现**：极简正则渲染（**不要引入 markdown 库**，包体敏感）；输出前 HTML-escape。只在笔记列表 tooltip/详情处渲染。
- **验收**：无 XSS（先 escape 再替换）；常见写法正确。

## 6. 硬性约束与陷阱（全部真实踩过）

- **T1 反引号**：`style.cjs` 的 CSS 是 JS 模板字符串——**注释/内容里严禁出现反引号**（已炸两次，esbuild 报 `Expected ";"`）。同理任何写入该模板的内容。
- **T2 SSE 连接池**：浏览器同源仅 ~6 连接。SSE 必须跟随面板可见性：`Panel` 的 effect 依赖 `[open, embedded]`；`LibraryTab` 尊重宿主 `visible === false` 卸载；**apply() 里禁止 ensureEvents()**。新增任何长连接/轮询前先想连接池。
- **T3 浮层必须 Portal**：菜单/浮条一律 `ReactDOM.createPortal(..., document.body)` + `position: fixed` + 测量定位（抄 `ui.cjs Dropdown.place()`），z-index 用 100010/100020 段位。面板内 `overflow:hidden` 会裁剪一切 absolute 浮层。
- **T4 flex 收缩**：阅读器的侧板类（`.zt-toc`/`.zt-candidates`）必须 `flex: 0 1 auto; min-height: 0`——它们可同开，不收缩会把 canvas 挤没。
- **T5 拖动定位**：位置 style 只能设在 `.zt-panel` 根（唯一 fixed 元素）；拖动时 inline `left/top` + `right/bottom: 'auto'`。
- **T6 pdf.js 懒加载**：node 侧 pdfjs 必须保持动态 import（`pdf-text.js`），顶层 import 会阻塞宿主事件循环 ~400ms（症状：全宿主 timeout）。
- **T7 git/npm 认证**：push 用 `TOKEN=$(grep -oE "github_pat_[A-Za-z0-9_]+" "C:/Users/JH Z/.dsh/memory/workspaces/--D--dsh_debug--/memory.md" | head -1)` + `TOKEN="$TOKEN" git -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$TOKEN"; }; f' push ...`（**TOKEN 必须作为命令前缀环境变量**，否则 helper 子进程读不到）。npm 见 §4.3。fine-grained PAT 不能跨组织建 PR。
- **T8 i18n**：嵌套结构 `ai: { jump: ... }`；新文案 zh/en 都要加，缺 en 的话英文界面显示中文。
- **T9 settings.cjs**：所有 hooks 必须在 early return 之前（React #310 渲染崩溃，check-settings.mjs 专门防它）。
- **T10 测试隔离**：`test-host.mjs` 的 `DSH_HOME` 必须在 import 任何 src 模块前设置；不要把测试指到真实 `~/.dsh`。
- **T11 包体**：client bundle 已 ~1.4MB（含 pdf.js worker 内联）。**不要**引入大依赖（markdown 渲染器、日期库等一律手写小函数）。
- **T12 node22**：所有命令用全路径 `C:\Users\JH Z\.workbuddy\binaries\node\versions\22.22.2-2\node.exe`。

## 7. 完成定义（每批）

1. 功能按 §5 验收标准逐条通过
2. `npm run prepublishOnly` 全绿
3. 新增 node 端点在 `test-host.mjs` 有断言；新增纯函数（如 bibtex 格式化）有单测
4. i18n zh/en 齐全
5. bump 版本 + 按 §4.3 发布（GitHub commit/tag/push + npm）
6. 更新 `README.md` 与 `README_EN.md` 的特性列表（保持双语一致，不夸大——描述会被 awesome 评审与代码核对）
