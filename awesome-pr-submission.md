# awesome-dsh-plugin 收录投稿材料（Aik358/dsh-literature）

## ✅ 已完成（2026-09-01 06:17，无需再操作）

- 分支 `add-dsh-literature` 已在你的 fork（Aik358/awesome-dsh-plugin）建好，YAML 文件已写入并验证正确
- **双击 `awesome-pr.url`（同目录）直接打开预填好的 PR 创建页 → 点 "Create pull request" 即完成**
- 备选：直接访问下面的预填链接

```
https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/compare/main...Aik358:add-dsh-literature?expand=1&title=Add%20Aik358%2Fdsh-literature&body=Adds%20one%20entry%3A%20%60data%2Fplugins%2FAik358__dsh-literature.yml%60.%0A%0A**Plugin**%3A%20%5BAik358%2Fdsh-literature%5D(https%3A%2F%2Fgithub.com%2FAik358%2Fdsh-literature)%20%E2%80%94%20a%20literature%20manager%20for%20DSH%3A%20a%20self-contained%20built-in%20library%20(no%20external%20app%20required%20to%20read%2Fwrite)%20with%20optional%20Zotero%20export%2C%20full-text%20PDF%20fetching%20across%20Unpaywall%20%2F%20arXiv%20%2F%20custom%20URL%20templates%2C%20loose%20Crossref-backed%20search%2C%20APA%20%2F%20GB-T%207714%20%2F%20MLA%20%2F%20Chicago%20citation%20generation%2C%20and%20a%20side-panel%20PDF%20reader%20with%20highlights%2C%20notes%2C%20and%20AI-assisted%20Q%26A%20%2F%20translation%20steered%20into%20the%20current%20DSH%20conversation.%0A%0A**Self-check**%0A-%20%60dsh.bundle%60%20manifest%20declared%20in%20%60package.json%60%20(%60cordis.patch.yml%60%20at%20repo%20root)%0A-%20Repo%20is%201%2B%20day%20old%2C%2015%2B%20commits%0A-%20%60dsh-plugin%60%20topic%20added%0A-%20npm%20package%20%60%40a9i5k4%2Fdsh-literature%60%20published%3B%20its%20%60repository%60%20field%20points%20back%20at%20the%20GitHub%20repo%20above%0A-%20One%20entry%20only%3B%20READMEs%20untouched%20(they%20are%20generated%20from%20%60data%2Fplugins%2F*.yml%60)%0A-%20%60description.en%60%20matches%20the%20code%20at%20%60main%60%20(v0.2.6)%0A%0A**Category**%3A%20%60tools%60%20%E2%80%94%20closest%20to%20existing%20%60tools%60%20entries%20%60Hongcheng-LI%2Fdsh-zotero%60%20and%20%60STARDUSTLC666%2Fdsh-cite%60.%20Distinct%20positioning%3A%20this%20plugin%20ships%20its%20own%20built-in%20library%2C%20a%20side-panel%20PDF%20reader%20(highlights%2Fnotes)%2C%20and%20AI-assisted%20reading%20actions%20wired%20into%20the%20active%20conversation.
```

## 一、需要添加的文件（已写入分支，仅供核对）

**路径**：`data/plugins/Aik358__dsh-literature.yml`（在 fork 里创建这个文件，粘贴下面全部内容）

```yaml
url: https://github.com/Aik358/dsh-literature
name: Aik358/dsh-literature
category: tools
description:
  en: 'Self-contained literature library for DSH with optional Zotero export: full-text PDF fetching (Unpaywall/arXiv/custom URL templates), loose Crossref-backed search, APA/GB-T 7714/MLA/Chicago citation generation, a side-panel PDF reader with highlights and notes, and AI-assisted Q&A/translation steered into the current conversation.'
  zh: 'DSH 内置文献库（可选导出到 Zotero）：通过 Unpaywall/arXiv/自定义 URL 模板获取全文 PDF，Crossref 候选式宽松搜索，APA/GB-T 7714/MLA/Chicago 引用生成，侧窗 PDF 阅读器（高亮与笔记），以及注入当前对话的 AI 问答/翻译。'
```

## 二、PR 标题

```
Add Aik358/dsh-literature
```

## 三、PR 正文

```markdown
Adds one entry: `data/plugins/Aik358__dsh-literature.yml`.

**Plugin**: [Aik358/dsh-literature](https://github.com/Aik358/dsh-literature) — a literature manager for DSH: a self-contained built-in library (no external app required to read/write) with optional Zotero export, full-text PDF fetching across Unpaywall / arXiv / custom URL templates, loose Crossref-backed search, APA / GB-T 7714 / MLA / Chicago citation generation, and a side-panel PDF reader with highlights, notes, and AI-assisted Q&A / translation steered into the current DSH conversation.

**Self-check**
- `dsh.bundle` manifest declared in `package.json` (`cordis.patch.yml` at repo root)
- Repo is 1+ day old, 15+ commits
- `dsh-plugin` topic added
- npm package [`@a9i5k4/dsh-literature`](https://www.npmjs.com/package/@a9i5k4/dsh-literature) published; its `repository` field points back at the GitHub repo above
- One entry only; READMEs untouched (they are generated from `data/plugins/*.yml`)
- `description.en` matches the code at `main` (v0.2.6)

**Category**: `tools` — closest to existing `tools` entries `Hongcheng-LI/dsh-zotero` and `STARDUSTLC666/dsh-cite`. Distinct positioning: this plugin ships its own built-in library, a side-panel PDF reader (highlights/notes), and AI-assisted reading actions wired into the active conversation.
```

## 四、操作步骤（网页端，约 1 分钟）

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> → 点 **Fork**
2. 在你 fork 后的仓库里，进入 `data/plugins/` 目录 → 点 **Add file → Create new file**
3. 文件名填：`Aik358__dsh-literature.yml`，把【一】的 YAML 内容粘贴进编辑框
4. 点 **Commit changes**（分支保持默认即可）
5. 回到仓库首页，点 **Compare & pull request**
6. 标题粘贴【二】，正文粘贴【三】→ 点 **Create pull request** 完成

> 说明：README 由脚本从 `data/plugins/*.yml` 自动生成，合并后会自动更新，**不要手工改 README**（贡献指南明确要求）。
