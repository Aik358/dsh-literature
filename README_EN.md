# DSH Literature · Side Panel

[![English](https://img.shields.io/badge/Language-English-blue)](README_EN.md) · [中文](./README.md)

> Detect, download, read and archive academic papers from the DeepSeek Harness
> side panel. DOIs / arXiv IDs / titles from the conversation drop straight
> into your local library with full text at hand.

---

## 📥 Install & Download (npm)

[![npm version](https://img.shields.io/npm/v/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![npm downloads](https://img.shields.io/npm/dt/@a9i5k4/dsh-literature)](https://www.npmjs.com/package/@a9i5k4/dsh-literature)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

**npm package:** [`@a9i5k4/dsh-literature`](https://www.npmjs.com/package/@a9i5k4/dsh-literature)

```bash
dsh plugin --profile web add @a9i5k4/dsh-literature
```

- Source & releases: [GitHub Releases](https://github.com/Aik358/dsh-literature/releases)
- Local development: `dsh plugin --profile web add D:/path/to/dsh-literature` (`link:` protocol)
- Restart `dsh web` after installing; a 「Papers」 entry appears in the sidebar
  (or merges into the right-sidebar workbench tab when present).

---

## ✨ Features

- **Built-in library** — detect, download, save, read and annotate with **zero
  external dependencies**; optionally export to a Zotero-ecosystem library or a folder
- **Auto-detection** — parse `DOI` / `arXiv` / `PMID` / `ISBN` / titles from replies or pasted text, deduped
- **Metadata** — Crossref / arXiv / OpenAlex fill in title, authors, journal, year, abstract
- **Full-text download** — OA multi-source chain (arXiv → OpenAlex OA → Unpaywall → DOI → publisher link), classified failures with retry; user-configured custom sources
- **Citation generator** — Scribbr-style: reference list / in-text / direct quote (with page) × APA 7 / GB/T 7714 / MLA 9 / Chicago 17 / **BibTeX**, one-click copy; **right-click** any card for the citation menu
- **Library management** — scan an import folder (DOI/arXiv/title inferred from file names), batch-import from a Zotero-ecosystem library, optional folder watch, add/remove entries; **tags** and **status filters**, **sorting** (added time / title / year); **multi-select batch export** of RIS / BibTeX / CSL-JSON
- **Side-panel reader** — built-in PDF viewer: zoom, pages, outline, full-text search, multi-colour highlights and notes (simple **Markdown notes**: bold / italic / inline code); **reading-position memory**, **keyboard shortcuts** (←/→ page, +/- zoom, / search, Esc dismiss), **night reading mode** (follows the dark theme or forced), **thumbnail sidebar** (≤50 pages), **one-click Markdown export** of all highlights & notes
- **AI assistant** — ChatPDF / SciSpace-style selection actions: **translate / explain / summarize** the selected passage, **ask questions about the full text**, or generate a **paper summary** — answers are steered into your current DeepSeek Harness chat, so you can keep asking follow-ups
- **Search portals** — every item links to Google Scholar / Baidu Xueshu / CNKI / source page
- **Conflict preview** — field-level diff against existing entries before saving
- **Bilingual UI** — switch the interface language between **Follow host** / **简体中文** / **English**; the choice applies immediately with no restart, and server-side notices and error messages follow the active language, so no Chinese text leaks into the English UI
- **Fully local** — loopback-only routes, no telemetry, no cloud relay, no account

## 🚀 Quick Start

1. Open the 「Papers」 panel (or paste text to detect)
2. Ask the model to call `zotero_lookup`, or paste text containing DOIs / arXiv IDs
3. Per entry: **download full text → read → save** (built-in library by default)

## ⚙️ Configuration

Gear icon in the panel header (sections: Saving & export / Detection & download / Behaviour & UI / Import / Custom sources / Advanced):

| Setting | Description | Default |
|---|---|---|
| Save target | `Built-in library` (no external app) / `Local library` (app required) / `Folder` | Built-in library |
| Export dir / Naming / Sidecars | folder target, name template, CSL-JSON/RIS choice | `{author}_{year}_{title}` |
| Default tags | comma separated, attached on save | empty |
| Auto-resolve / quoted titles / scan replies | detection & false-positive control | on / on / off |
| Retries / timeout | network retry & timeout control | 3 / 30s |
| Duplicate strategy | ask / keep / replace | ask |
| Entry placement | auto (right-sidebar tab first) / footer / hidden | auto |
| Panel width / reader fit / night mode | floating size & initial reader view / follow dark theme or force | 380px / fit-width / auto |
| Import folder / watch | bring local PDFs into the library (manual or every 30s) | empty / off |
| Custom download sources | your mirrors / proxies / endpoints (with headers) | empty |

## 🧩 dsh-better-sidebar integration

When [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) is installed, the plugin registers a **right-sidebar tab** via `ctx.get('betterSidebar').registerTab` and stops using the sidebar footer; otherwise it falls back to the footer entry + floating panel, probing continuously and migrating automatically.

## 📚 Citations

The 「Cite」 menu on every card:

| Mode | Description |
|---|---|
| Reference list | APA 7 / GB/T 7714-2015 / MLA 9 / Chicago 17 entries |
| In-text | `(Vaswani et al., 2017)` |
| Direct quote | page prompt → `(Vaswani et al., 2017, p. 7)` |
| BibTeX | full `@article{...}` entry, ready for JabRef / Overleaf |

## 🔌 Custom download sources

Within compliance bounds, add mirrors / institutional proxies / private endpoints you trust in Settings:

- URL placeholders: `{doi}` `{arxiv}` `{isbn}` `{title}` `{url}`
- Extra headers (one `Name: Value` per line) for token/cookie-gated endpoints
- Appended after the official OA chain as fallbacks; malformed templates are skipped

> Compliance: these sources are your own configuration and your responsibility; the plugin ships no pirated or infringing source.

## 🔒 Paywalled & login-gated papers

Only public open-access sources are fetched automatically. For login-gated papers:

1. The entry is marked 「Login required」 with a reason
2. 「Open login page」 lets you sign in / access via your institution
3. After downloading, 「Import local PDF」 validates and saves the file automatically

## 🧠 How it works

```
Browser panel ── fetch / SSE ──▶ DSH host ──▶ local library (optional) / custom sources
```

- Default (built-in library) keeps entries + PDFs in the plugin's own local storage — no external app
- Exporting to a Zotero-ecosystem library: browsers cannot reach it directly (CORS), so reads/writes go through the DSH host using the official Connector protocol

## 🔐 Privacy

- Metadata & full-text requests go straight to public scholarly APIs — no third-party relay
- Loopback-only (`127.0.0.1`); non-loopback requests get 403
- No telemetry, no analytics, nothing uploaded

## 🖥️ Compatibility

| Component | Version |
|---|---|
| DeepSeek Harness | ≥ 0.1.1-rc.2 (Cordis v4) |
| Local library (optional) | 8.x (Zotero ecosystem, Local API v3 / Connector API) |
| Node | ≥ 20 |

> Independent open-source implementation, not affiliated with any library vendor.

## ❓ FAQ

**Nothing appears after saving?**
Check the save target; built-in mode is fully offline and needs no app running.

**Paywalled paper won't download?**
Marked 「Login required / paywall」: sign in via 「Open login page」, download, then 「Import local PDF」; or configure custom sources.

**Settings not applied?**
Settings persist instantly; changing the port requires restarting the library app.

## 🛠️ Development

```bash
npm install
npm run build          # outputs lib/
npm run smoke          # logic smoke tests
npm run check:client   # client bundle shape + apply matrix
npm run test           # host end-to-end
```

```
src/
├── node/          # host: routes / detection / metadata / download / cite / import / shadow store
│   ├── zotero/    # local-library interaction (read-only queries + Connector writes)
│   ├── metadata/  # Crossref · arXiv · OpenAlex
│   └── fetch/     # OA chain / custom sources / retry
└── client/        # browser: panel UI / cite menus / pdf.js reader (self-bundled)
```

## 📄 License

[MIT](LICENSE)

Trademark notice: not affiliated with Zotero; "Zotero" is a trademark of its owner, used here only to describe compatibility.
