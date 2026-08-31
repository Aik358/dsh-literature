# DSH Literature · 文献侧窗

[![中文](https://img.shields.io/badge/语言-中文-blue)](#) · [English](./README_EN.md)

> 在 DeepSeek Harness 侧边栏里识别、下载、阅读并归档学术文献。
> 对话中出现的 DOI / arXiv ID / 标题，一键落入本地文献库，全文随取随读。

---

## 📥 安装与下载（npm）

[![npm version](https://img.shields.io/npm/v/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![npm downloads](https://img.shields.io/npm/dt/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

**npm 包：** [`@a9i5k4/dsh-literature`](https://www.npmjs.com/package/@a9i5k4/dsh-literature)

```bash
dsh plugin --profile web add @a9i5k4/dsh-literature
```

- 源码与发布版：[GitHub Releases](https://github.com/Aik358/dsh-literature/releases)
- 本地开发：`dsh plugin --profile web add D:/path/to/dsh-literature`（`link:` 协议）
- 安装后重启 `dsh web`，侧边栏出现「文献」入口（若装有右侧栏工作台则并入其 tab）

---

## ✨ 特性

- **内置文献库** —— 识别、下载、保存、阅读、笔记全程自给自足，**不依赖任何外部软件**；可选导出到本地文献库（Zotero 生态）或目录
- **自动识别** —— 从模型回复或粘贴文本解析 `DOI` / `arXiv` / `PMID` / `ISBN` / 标题，自动去重
- **元数据抓取** —— Crossref / arXiv / OpenAlex，自动补全标题、作者、期刊、年份、摘要
- **全文下载** —— OA 多源（arXiv → OpenAlex OA → Unpaywall → DOI → 出版商链接），失败明确分类并支持重试；可配置自定义下载源
- **引用生成器** —— Scribbr 风格：参考文献 / 文内引用 / 直接引用（带页码）× APA 7 / GB/T 7714 / MLA 9 / Chicago 17，一键复制
- **库管理** —— 扫描导入文件夹（文件名自动识别 DOI/arXiv/标题）、从本地文献库批量导入、自动监控新 PDF、条目增删
- **侧窗阅读** —— 内置 PDF 阅读器：缩放、翻页、目录跳转、全文搜索、多色高亮与笔记
- **AI 助手联动** —— ChatPDF / SciSpace 式划词操作：选中文字即可**翻译 / 解释 / 总结**；工具栏可**对全文提问**（基于 PDF 文本回答）或一键**总结全文**；结果直接发送到当前 DeepSeek Harness 对话，可继续追问
- **全网入口** —— 每条文献直达 Google Scholar / 百度学术 / 知网 / 来源页
- **冲突预览** —— 库中已有相似条目时，先展示字段级差异再决定保留 / 覆盖 / 合并
- **完全本地** —— 所有请求经本机回环接口转发，无遥测、无云端中转、无账号依赖

## 🚀 快速开始

1. 点击「文献」打开侧窗（或粘贴文本识别）
2. 让模型调用 `zotero_lookup`，或直接粘贴含 DOI / arXiv ID 的文本
3. 条目入窗后：**下载全文 → 阅读 → 保存**（默认存内置文献库）

```
"参考 DOI: 10.1038/xxxx"   →   条目出现，自动解析元数据
"arXiv:1706.03762"         →   一键下载全文 PDF
点击「保存」                →   存入内置文献库（可随时导出）
```

## ⚙️ 配置

侧窗右上角齿轮进入设置（分类：保存与导出 / 识别与下载 / 行为与界面 / 导入管理 / 自定义下载源 / 高级）：

| 项 | 说明 | 默认 |
|---|---|---|
| 保存方式 | `内置文献库`（无需外部软件）/ `本地文献库`（需运行）/ `目录` | 内置文献库 |
| 导出目录 / 命名规则 / 导出侧车 | 目录模式的目标路径、命名模板、CSL-JSON/RIS 选择 | `{author}_{year}_{title}` |
| 默认标签 | 保存时附加，逗号分隔 | 空 |
| 自动解析 / 标题识别 / 自动扫描回复 | 识别策略与误报控制 | 开 / 开 / 关 |
| 重试次数 / 下载超时 | 网络重试与超时控制 | 3 次 / 30s |
| 重复条目策略 | 询问 / 保留库中 / 覆盖为新版本 | 询问 |
| 入口位置 | 自动（优先右侧栏 tab）/ 固定左侧栏 / 隐藏 | 自动 |
| 面板宽度 / 阅读器默认缩放 | 浮窗尺寸与阅读初始视图 | 380px / 适应宽度 |
| 导入文件夹 / 自动扫描 | 本机 PDF 入库（手动或每 30s 自动） | 空 / 关 |
| 自定义下载源 | 自建镜像 / 机构代理 / 专属端点（含请求头） | 空 |

## 🧩 与 dsh-better-sidebar 集成

安装了 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 时，插件自动把「文献」注册为**右侧栏 tab**（`ctx.get('betterSidebar').registerTab`），不再占用左侧栏按钮位；未安装则回退为左侧栏入口 + 浮窗，并持续探测，检测到后自动迁移。

## 📚 引用生成

每条文献卡片的「引用」菜单：

| 模式 | 说明 |
|---|---|
| 参考文献 | APA 7 / GB/T 7714-2015 / MLA 9 / Chicago 17 完整条目 |
| 文内引用 | `(Vaswani et al., 2017)` / `（Vaswani等，2017）` |
| 直接引用 | 输入页码后生成 `(Vaswani et al., 2017, p. 7)` 等 |

## 🔌 自定义下载源

合规前提下，你可以在设置里添加**自己信任**的镜像 / 机构代理 / 专属端点：

- URL 模板变量：`{doi}` `{arxiv}` `{isbn}` `{title}` `{url}`
- 自定义请求头（每行 `名称: 值`），适配带 token / cookie 的端点
- 作为官方 OA 链之后的兜底；缺变量或非法模板自动跳过

> 合规提醒：这些源由你自行配置并对其合法性负责，插件不内置任何破解或侵权来源。

## 🔒 付费墙与需要登录的文献

全文抓取仅使用公开的开放获取来源。当文献需要**登录或机构订阅**时：

1. 条目标记「需要登录」并给出原因
2. 「打开登录页」在浏览器完成登录 / 机构访问
3. 下载 PDF 后点「导入本地 PDF」，插件校验并自动执行保存流程

## 🧠 工作原理

```
浏览器侧窗 ── fetch / SSE ──▶ DSH 宿主进程 ──▶ 本地文献库（可选）/ 自定义源
  · 识别/状态/进度       · 解析与下载        · 内置库 / OA 链
  · PDF 阅读器          · 影子索引与笔记
```

- 默认（内置文献库）把条目与全文存放在插件自己的本地存储，**不依赖任何外部软件**
- 导出到本地文献库（Zotero 生态）时：浏览器无法直连（CORS 仅放行特定来源），读写经 DSH 宿主转发，写入走官方 Connector 协议两步提交

## 🔐 数据与隐私

- 元数据与全文请求直连公开学术 API（Crossref / arXiv / OpenAlex / Unpaywall），**不经任何第三方中转**
- 插件仅监听 `127.0.0.1` 回环路由，非本机请求一律 403
- 无遥测、无统计、不上传任何本地数据

## 🖥️ 兼容性

| 组件 | 版本 |
|---|---|
| DeepSeek Harness | ≥ 0.1.1-rc.2（Cordis v4） |
| 本地文献库（可选） | 8.x（Zotero 生态，Local API v3 / Connector API） |
| Node | ≥ 20 |

> 本插件与文献库官方无任何附属关系，为独立的开源兼容实现。

## ❓ 常见问题

**保存后没看到条目？**
确认保存方式；内置库模式完全离线，无需任何应用运行。

**付费文献下载失败？**
条目标记「需要登录/付费墙」：先「打开登录页」完成登录，下载后「导入本地 PDF」即可入库；或配置自定义下载源。

**修改设置后没生效？**
设置即时落盘；修改端口后需重启文献库应用使其生效。

## 🛠️ 开发

```bash
npm install
npm run build      # 产物输出到 lib/
npm run smoke      # 逻辑冒烟
npm run check:client  # 前端 bundle 结构 + apply 矩阵
npm run test       # 宿主侧端到端
```

```
src/
├── node/          # 宿主侧：路由 / 识别 / 元数据 / 下载 / 引用 / 导入 / 影子库
│   ├── zotero/    # 与本地文献库交互（只读查询 + Connector 写入）
│   ├── metadata/  # Crossref · arXiv · OpenAlex
│   └── fetch/     # OA 全文获取 / 自定义源 / 重试
└── client/        # 浏览器侧：侧窗 UI / 引用菜单 / PDF 阅读器（pdf.js 自捆）
```

## 📄 License

[MIT](LICENSE)

商标声明：本插件与 Zotero 官方无任何关联。"Zotero" 为其版权所有者的商标，此处仅用于描述兼容性。
