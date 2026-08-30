# DSH Literature · 文献侧窗

> 在 DeepSeek Harness 侧边栏里识别、下载、阅读并归档学术文献。
> 对话中出现的 DOI / arXiv ID / 标题，一键落入本地文献库，全文随取随读。

[![npm version](https://img.shields.io/npm/v/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![npm downloads](https://img.shields.io/npm/dt/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

---

## 特性

- **自动识别** —— 从模型回复或粘贴文本中解析 `DOI`、`arXiv`、`PMID`、`ISBN` 与标题引用，去重后生成侧窗条目
- **元数据抓取** —— 内置 Crossref / arXiv / OpenAlex 解析，自动补全标题、作者、期刊、年份与摘要
- **全文下载** —— 按 OA 来源（arXiv、OpenAlex OA、Unpaywall、出版商 `citation_pdf_url`）抓取 PDF，失败时给出明确原因并支持重试
- **内置文献库** —— 识别、下载、阅读、笔记全部自给自足，**不依赖任何外部软件**；可选把条目导出到本地文献库（Zotero 生态，走官方 Connector 协议）或导出为 `PDF + .csl.json + .ris` 到任意目录
- **侧窗阅读** —— 内置 PDF 阅读器：缩放、翻页、目录跳转、全文搜索、高亮与笔记
- **冲突预览** —— 库中已有相似条目时，先展示字段级差异再决定保留 / 覆盖 / 合并
- **完全本地** —— 所有请求经本机回环接口转发，无遥测、无云端中转、无账号依赖

## 安装

要求：DeepSeek Harness（`dsh` CLI）已安装，Node ≥ 20。

```bash
dsh plugin --profile web add @a9i5k4/dsh-literature
```

> 本地开发时可改用 `dsh plugin --profile web add D:/path/to/dsh-literature`（`link:` 协议）。

安装后重启 `dsh web`，左侧边栏底部会出现「文献」入口。

## 快速开始

1. 点击侧边栏「文献」打开侧窗
2. 直接粘贴一段含文献的文本，或让模型在回复中调用 `zotero_lookup` 工具
3. 条目进入侧窗后：**下载全文 → 阅读 → 保存**

```
对话回复                       侧窗动作
─────────────────────────────  ─────────────────────────────
"参考 DOI: 10.1038/xxxx"   →   条目出现，自动解析元数据
"arXiv:1706.03762"         →   一键下载全文 PDF
点击「保存」                →   存入内置文献库（无需外部软件，可随时导出）
```

## 配置

侧窗右上角齿轮进入设置（分类：保存与导出 / 识别与下载 / 行为与界面 / 本地文献库）：

| 项 | 说明 | 默认 |
|---|---|---|
| 保存方式 | `内置文献库`（无需外部软件）/ `本地文献库`（需运行）/ `目录` | 内置文献库 |
| 导出目录 / 命名规则 / 导出侧车 | 目录模式的目标路径、命名模板、CSL-JSON/RIS 选择 | `{author}_{year}_{title}` |
| 默认标签 | 保存时附加，逗号分隔 | 空 |
| 自动解析 / 标题识别 / 自动扫描回复 | 识别策略与误报控制 | 开 / 开 / 关 |
| 重试次数 / 下载超时 | 网络重试与超时控制 | 3 次 / 30s |
| 重复条目策略 | 询问 / 保留库中 / 覆盖为新版本 | 询问 |
| 面板宽度 / 阅读器默认缩放 | 浮窗尺寸与阅读初始视图 | 380px / 适应宽度 |
| Unpaywall 邮箱 | 开放获取查询的请求方标识（建议填写） | 空 |
| 文献库端口 / 数据目录 | 连接参数，可手动覆盖 | 23119 / 自动 |

## 与 dsh-better-sidebar 集成

若安装了 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（右侧栏工作台），插件会自动检测并**把「文献」作为右侧栏的一个 tab** 注册（`ctx.betterSidebar.registerTab`），不再占用 DSH 左侧栏底部的按钮位，避免与其它插件入口挤兑。未安装时则回退为左侧栏入口 + 浮窗。

## 付费墙与需要登录的文献

全文抓取仅使用出版商公开的开放获取来源。当文献需要**登录或机构订阅**时：

1. 条目会明确标记为「需要登录」，并给出原因
2. 点击「打开登录页」在浏览器中完成登录 / 机构访问
3. 下载 PDF 后回到侧窗点「导入本地 PDF」选择文件
4. 插件校验文件、写入影子库并自动执行保存流程（入库或导出目录）

> 出于版权与合规考虑，插件不接入任何破解 / 镜像来源，也不代为保存账号密码。

## 工作原理

```
浏览器侧窗  ── fetch / SSE ──▶  DSH 宿主进程  ── HTTP :23119 ──▶  本地文献库
  · 识别/状态/进度        · 解析与下载          · 只读查询 / 写入
  · PDF 阅读器           · 影子索引与笔记
```

- 默认模式（内置文献库）把条目与全文存放在插件自己的本地存储里，**不依赖任何外部软件**
- 需要时可将条目导出到本地文献库（Zotero 生态）：浏览器无法直连（CORS 仅放行特定来源），因此**读写都经 DSH 宿主转发**，写入走官方 Connector 协议两步提交
- 高亮与笔记保存在插件自己的影子存储中，不侵入文献库数据
- 保存目标为文献库当前选中位置；如需归类集合，先在文献库中选择对应集合

## 数据与隐私

- 元数据与全文下载请求直连公开学术 API（Crossref / arXiv / OpenAlex / Unpaywall），**不经过任何第三方中转**
- 插件仅监听 `127.0.0.1` 回环路由，非本机请求一律返回 403
- 无遥测、无统计、不上传任何本地数据

## 兼容性

| 组件 | 版本 |
|---|---|
| DeepSeek Harness | ≥ 0.1.1-rc.2（Cordis v4） |
| 本地文献库 | 8.x（Zotero 生态，本地 HTTP API v3 / Connector API） |
| Node | ≥ 20 |

> 本插件与文献库官方无任何附属关系，为独立的开源兼容实现。

## 常见问题

**保存后文献库没出现条目？**
确认文献库已启动、保存目标（当前选中集合）可写；侧窗顶部会显示连接状态。

**付费文献下载失败？**
条目会标记为"需要登录/付费墙"：先点「打开登录页」完成登录，下载 PDF 后点「导入本地 PDF」即可入库，无需手动建条目。

**修改设置后没生效？**
设置即时落盘；修改端口后需重启文献库使其生效。

## 开发

```bash
npm install
npm run build      # 产物输出到 lib/
npm run smoke      # 逻辑冒烟
npm run test       # 宿主侧端到端（模拟请求）
```

```
src/
├── node/          # 宿主侧：路由 / 识别 / 元数据 / 下载 / 写入 / 影子库
│   ├── zotero/    # 与本地文献库交互（只读查询 + Connector 写入）
│   ├── metadata/  # Crossref · arXiv · OpenAlex
│   └── fetch/     # OA 全文获取与重试
└── client/        # 浏览器侧：侧窗 UI / PDF 阅读器（pdf.js 自捆）
```

## License

[MIT](LICENSE)

商标声明：本插件与 Zotero 官方无任何关联。"Zotero" 为其版权所有者的商标，此处仅用于描述兼容性。
