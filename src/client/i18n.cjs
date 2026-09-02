const NS = 'dsh-literature'

const zh = {
  entry: '文献',
  panelTitle: '文献库',
  open: '打开文献侧窗',
  close: '关闭',
  settingsTooltip: '设置',
  back: '返回',
  empty: {
    title: '还没有文献',
    body: '对话中出现的 DOI、arXiv ID 或标题会自动出现在这里，也可以手动粘贴。',
    paste: '粘贴文本识别',
    placeholder: '粘贴一段包含 DOI / arXiv ID / 标题的文本…',
    add: '识别',
  },
  /**
   * Server-side failures arrive as `e.message`, which would otherwise leak
   * Chinese strings into an English UI. Errors carrying a `code` are mapped
   * through this table by localizeError(); anything else falls through to the
   * raw message.
   */
  error: {
    timeout: '请求超时，请重试',
    uploadTimeout: '上传超时，请重试',
    invalidKey: '无效的条目标识',
    missingKey: '缺少条目标识',
    pdfNotDownloaded: '全文尚未下载',
    methodNotAllowed: '请求方法不被允许',
    forbidden: '仅允许本机访问',
    notFound: '找不到请求的资源',
    itemNotFound: '找不到该条目',
    noSelection: '没有选择要导出的条目',
    noMetadata: '所选条目缺少元数据，无法导出',
    noMetadataCite: '条目缺少元数据，无法生成引用',
    pdfLoadTimeout: 'PDF 加载超时，请重试',
    pdfLoadFailed: 'PDF 加载失败，请重试',
    pdfRenderFailed: '第 {page} 页渲染失败：{message}',
  },
  state: {
    discovered: '待解析',
    resolving: '解析元数据…',
    resolved: '已解析',
    fetching: '下载全文…',
    fetched: '已下载',
    saving: '保存中…',
    saved: '已保存',
    save_failed: '保存失败',
    fetch_failed: '下载失败',
    resolve_failed: '解析失败',
    needs_login: '需要登录',
    duplicate: '疑似重复',
  },
  badge: {
    builtin: '内置库',
    library: '本地库',
    dir: '目录',
    mode: { builtin: '内置库', zotero: '本地库', dir: '目录' },
  },
  authors: { join: '、', etAl: '{names} 等' },
  action: {
    download: '下载全文',
    retry: '重试',
    save: '保存到文献库',
    saveDir: '导出到目录',
    read: '阅读',
    diff: '冲突对比',
    discard: '移除',
    cancel: '取消',
    confirm: '确认',
    keep: '保留库中版本',
    replace: '覆盖为新版本',
    merge: '仅补充缺失字段',
    openInZotero: '在文献库中打开',
    exportToLibrary: '导出到文献库',
    exportToDir: '导出到目录',
    openSource: '打开来源',
    openLoginPage: '打开登录页',
    importPdf: '导入本地 PDF',
    importPdfHint: '在浏览器登录并下载 PDF 后，从这里选择文件导入',
    launch: '启动文献库',
    saveAnyway: '仍然保存',
    sourcePlaceholder: '校内镜像',
    copied: '已复制 {label}',
    importedCount: '{name}：新增 {count} 条',
  },
  banner: {
    zoteroDown: '文献库未运行——保存到文献库会失败，可改用内置文献库',
    zoteroDownDir: '文献库未运行，可改为导出到目录',
    offline: '宿主不可达',
    switchBuiltin: '改用内置库',
    switched: '已切换到内置文献库',
  },
  reader: {
    fitWidth: '适应宽度',
    fitPage: '适应页面',
    page: '页',
    of: '/',
    toc: '目录',
    search: '搜索',
    highlight: '高亮',
    notes: '笔记',
    prev: '上一页',
    next: '下一页',
    zoomIn: '放大',
    zoomOut: '缩小',
    close: '关闭阅读器',
    noOutline: '该 PDF 没有目录',
    loading: '正在加载 PDF…',
    notDownloaded: '全文尚未下载',
    addNote: '添加笔记',
    deleteAnnotation: '删除',
    exportNotes: '导出全部高亮与笔记',
    noNotes: '还没有高亮或笔记',
    thumbs: '页面缩略图',
    thumbsTooMany: 'PDF 超过 50 页，暂不支持缩略图',
    noResults: '没有匹配结果',
    pagesPrompt: '页码（如 12-15）',
    promptHint: '页码（如 12）',
  },
  settings: {
    title: '文献侧窗设置',
    sectionLanguage: '语言',
    uiLanguage: '界面语言',
    uiLanguageHint: '“跟随宿主”会随 DeepSeek 客户端的语言自动切换',
    lang: { auto: '跟随宿主', zh: '简体中文', en: 'English' },
    sectionSave: '保存与导出',
    sectionDetect: '识别与下载',
    sectionBehavior: '行为与界面',
    sectionLibrary: '本地文献库',
    saveMode: '保存方式',
    saveModeBuiltin: '内置文献库（无需外部软件）',
    saveModeZotero: '写入本地文献库（需运行）',
    saveModeDir: '导出到本地目录',
    dirPath: '导出目录',
    dirPathHint: '通道 C：写入 PDF + 元数据侧车文件，便于手动导入',
    naming: '命名规则',
    namingHint: '可用变量：{author} {authors} {year} {title} {journal} {doi} {arxiv}',
    exportFormats: '导出侧车格式',
    exportFormatsHint: '目录模式额外写出的元数据文件',
    tags: '默认标签',
    tagsHint: '逗号分隔，保存时附加到条目',
    unpaywallEmail: 'Unpaywall 邮箱',
    unpaywallEmailHint: '用于查询开放获取全文，仅作为请求方标识',
    autoResolve: '识别后自动解析元数据',
    autoResolveHint: '扫描到标识符后立即联网解析标题/作者/期刊',
    includeTitles: '识别标题引用',
    includeTitlesHint: '把引号中的标题也当作检索候选（可能误报）',
    autoScan: '自动扫描模型回复',
    autoScanHint: '把回复中的文献自动加入侧窗；可能产生误报',
    retryMaxAttempts: '下载重试次数',
    fetchTimeoutMs: '下载超时（秒）',
    conflictStrategy: '重复条目默认策略',
    conflictStrategyHint: '保存时发现库中已有相似条目的处理方式',
    conflictAsk: '每次都询问（弹出差异对比）',
    conflictKeep: '保留库中版本',
    conflictReplace: '直接覆盖为新版本',
    panelWidth: '面板宽度（px）',
    panelWidthHint: '浮窗模式下的默认宽度，可拖动边缘调整',
    entryMode: '入口位置',
    entryModeHint: '有右侧栏工作台（dsh-better-sidebar）时自动并入；也可固定为左侧栏按钮或完全隐藏',
    customSources: '自定义下载源',
    customSourcesHint: '添加你自己信任的镜像 / 机构代理 / 专属源；URL 支持变量 {doi} {arxiv} {isbn} {title} {url}',
    customSourcesCompliance: '合规提醒：这些源由你自行配置并对其合法性负责，插件仅按填写的地址发起请求，不内置任何破解或侵权来源。',
    sourceLabel: '名称',
    sourceUrlTemplate: 'URL 模板',
    sourceHeaders: '自定义请求头（每行一个，格式 名称: 值）',
    sourceEnabled: '启用该源',
    addSource: '添加自定义源',
    addSourceConfirm: '确认添加',
    advanced: '高级（连接外部文献库 / 导入管理）',
    sectionImport: '导入管理',
    importDir: '导入文件夹',
    importDirHint: '把本机 PDF 放入该文件夹，可手动或自动扫描进内置文献库',
    watchImport: '自动扫描导入文件夹',
    watchImportHint: '每 30 秒检查一次新 PDF 并自动入库',
    entryAuto: '自动（优先右侧栏 tab）',
    entryFooter: '固定为左侧栏按钮',
    entryHide: '隐藏（仅从设置页访问）',
    readerFit: '阅读器默认缩放',
    nightMode: '夜读模式',
    nightAuto: '自动（跟随暗色主题）',
    nightOn: '始终开启',
    nightOff: '关闭',
    fitWidth: '适应宽度',
    fitPage: '适应页面',
    zoteroPort: '文献库端口',
    dataDir: '数据目录',
    dataDirHint: '自动探测本地文献库位置，可手动覆盖',
    saved: '已保存',
    test: '测试连接',
    testOk: '连接正常',
    testFail: '连接失败',
  },
  diff: {
    title: '库中已有相似条目',
    subtitle: '字段差异如下，选择处理方式：',
    noDiff: '字段完全一致',
    colField: '字段',
    colInLibrary: '库中',
    colIncoming: '新条目',
    notSupported: '连接接口只支持新增，不支持更新/覆盖；如需覆盖请在文献库中手动处理',
  },
  cite: {
    title: '引用',
    reference: '参考文献',
    intext: '文内引用',
    direct: '直接引用（输入页码）',
    bibtex: 'BibTeX 条目',
  },
  search: {
    title: '全网搜索',
    scholar: 'Google Scholar',
    baidu: '百度学术',
    cnki: '知网（CNKI）',
    source: '来源页',
  },
  importMenu: '导入文献',
  searchCandidates: {
    title: '未识别到明确标识符，为你找到以下候选：',
    empty: '没有找到匹配结果，可尝试下方外部搜索',
    add: '添加',
    external: '或在外部搜索：',
  },
  dropNoPdf: '请拖入 PDF 文件',
  dropOk: '已导入：',
  importDir: '扫描导入文件夹',
  importNoDir: '请先在设置中配置导入文件夹',
  importNoDirHint: '文件夹路径未配置',
  importZotero: '从本地文献库导入',
  importZoteroHint: '需要文献库应用运行',
  importZoteroDown: '文献库未运行',
  status: { ready: '就绪', running: '文献库运行中', down: '文献库未运行' },
  list: {
    selectMode: '选择',
    selectAll: '全选',
    clear: '取消选择',
    selectedPrefix: '已选',
    exportTitle: '导出',
    noSelection: '先勾选要导出的条目',
    exported: '已导出：',
    tagAdd: '添加标签（回车确认）',
    tagRemove: '删除标签',
  },
  filter: {
    all: '全部',
    pending: '未入库',
    saved: '已入库',
    failed: '失败',
    tag: '标签',
    sort: '排序',
    sortCreated: '按添加时间',
    sortTitle: '按标题',
    sortYear: '按年份',
    empty: '没有符合条件的条目',
  },
  ai: {
    ask: '问 AI',
    askHint: '对当前文献提问，AI 会基于全文回答（发送到当前对话）',
    tldr: '总结全文',
    tldrHint: '让 AI 生成这篇文献的要点摘要（发送到当前对话）',
    translate: '翻译',
    explain: '解释',
    summarize: '总结这段',
    highlight: '高亮',
    jump: '跳转',
    selectionTitle: '划词操作',
    placeholder: '就这篇文献提问…',
    sending: '已发送到当前对话，AI 正在回答…',
    noSession: '当前没有活跃对话，请先开始一个对话再试',
    noText: '这篇 PDF 没有可提取的文本（可能是扫描件）',
    noPdf: '该条目还没有 PDF 全文',
    selectHint: '在阅读器中选中文字即可翻译 / 解释 / 总结',
    toSession: '（已发送到当前对话）',
  },
}

const en = {
  entry: 'Papers',
  panelTitle: 'Library',
  open: 'Open literature panel',
  close: 'Close',
  settingsTooltip: 'Settings',
  back: 'Back',
  empty: {
    title: 'No papers yet',
    body: 'DOIs, arXiv IDs or titles from the conversation appear here automatically. You can also paste text.',
    paste: 'Paste to detect',
    placeholder: 'Paste text containing a DOI / arXiv ID / title…',
    add: 'Detect',
  },
  error: {
    timeout: 'Request timed out — please retry',
    uploadTimeout: 'Upload timed out — please retry',
    invalidKey: 'Invalid item key',
    missingKey: 'Missing item key',
    pdfNotDownloaded: 'Full text has not been downloaded yet',
    methodNotAllowed: 'Method not allowed',
    forbidden: 'Loopback connections only',
    notFound: 'Resource not found',
    itemNotFound: 'Item not found',
    noSelection: 'Select at least one item to export',
    noMetadata: 'The selected items lack metadata and cannot be exported',
    noMetadataCite: 'This item lacks metadata, so no citation can be built',
    pdfLoadTimeout: 'PDF loading timed out — please retry',
    pdfLoadFailed: 'Could not load the PDF — please retry',
    pdfRenderFailed: 'Failed to render page {page}: {message}',
  },
  state: {
    discovered: 'Pending',
    resolving: 'Resolving metadata…',
    resolved: 'Resolved',
    fetching: 'Downloading PDF…',
    fetched: 'Downloaded',
    saving: 'Saving…',
    saved: 'Saved',
    save_failed: 'Save failed',
    fetch_failed: 'Download failed',
    resolve_failed: 'Resolve failed',
    needs_login: 'Login required',
    duplicate: 'Possible duplicate',
  },
  badge: {
    builtin: 'Built-in',
    library: 'Library',
    dir: 'Folder',
    mode: { builtin: 'Built-in', zotero: 'Library', dir: 'Folder' },
  },
  authors: { join: ', ', etAl: '{names} et al.' },
  action: {
    download: 'Download PDF',
    retry: 'Retry',
    save: 'Save to library',
    saveDir: 'Export to folder',
    read: 'Read',
    diff: 'Compare',
    discard: 'Remove',
    cancel: 'Cancel',
    confirm: 'Confirm',
    keep: 'Keep library version',
    replace: 'Overwrite with new version',
    merge: 'Fill missing fields only',
    openInZotero: 'Open in library',
    exportToLibrary: 'Export to library',
    exportToDir: 'Export to folder',
    openSource: 'Open source',
    openLoginPage: 'Open login page',
    importPdf: 'Import local PDF',
    importPdfHint: 'After signing in and downloading the PDF in your browser, pick the file here',
    launch: 'Launch library',
    saveAnyway: 'Save anyway',
    sourcePlaceholder: 'Campus mirror',
    copied: 'Copied {label}',
    importedCount: '{name}: {count} new',
  },
  banner: {
    zoteroDown: 'Library is not running — saving to it will fail; you can switch to the built-in library',
    zoteroDownDir: 'Library is not running — you can export to a folder instead',
    offline: 'Host unreachable',
    switchBuiltin: 'Use built-in',
    switched: 'Switched to the built-in library',
  },
  reader: {
    fitWidth: 'Fit width',
    fitPage: 'Fit page',
    page: 'Page',
    of: '/',
    toc: 'Outline',
    search: 'Search',
    highlight: 'Highlight',
    notes: 'Notes',
    prev: 'Previous page',
    next: 'Next page',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    close: 'Close reader',
    noOutline: 'This PDF has no outline',
    loading: 'Loading PDF…',
    notDownloaded: 'Full text not downloaded yet',
    addNote: 'Add note',
    deleteAnnotation: 'Delete',
    exportNotes: 'Export all highlights & notes',
    noNotes: 'No highlights or notes yet',
    thumbs: 'Page thumbnails',
    thumbsTooMany: 'PDFs over 50 pages do not support thumbnails',
    noResults: 'No matches',
    pagesPrompt: 'Pages (e.g. 12-15)',
    promptHint: 'Page (e.g. 12)',
  },
  settings: {
    title: 'Literature panel settings',
    sectionLanguage: 'Language',
    uiLanguage: 'Interface language',
    uiLanguageHint: '"Follow host" switches with the DeepSeek client language',
    lang: { auto: 'Follow host', zh: 'Chinese (Simplified)', en: 'English' },
    sectionSave: 'Saving & export',
    sectionDetect: 'Detection & download',
    sectionBehavior: 'Behaviour & UI',
    sectionLibrary: 'Local library',
    saveMode: 'Save target',
    saveModeBuiltin: 'Built-in library (no external app)',
    saveModeZotero: 'Local library (needs the app running)',
    saveModeDir: 'Export to local directory',
    dirPath: 'Export directory',
    dirPathHint: 'Writes PDF + metadata sidecars for manual import',
    naming: 'Naming rule',
    namingHint: 'Variables: {author} {authors} {year} {title} {journal} {doi} {arxiv}',
    exportFormats: 'Export sidecars',
    exportFormatsHint: 'Metadata files written alongside the PDF in directory mode',
    tags: 'Default tags',
    tagsHint: 'Comma separated, attached on save',
    unpaywallEmail: 'Unpaywall email',
    unpaywallEmailHint: 'Used to query open-access copies, sent as the requester identity',
    autoResolve: 'Auto-resolve after detection',
    autoResolveHint: 'Fetch title/authors/journal immediately after an identifier is found',
    includeTitles: 'Detect quoted titles',
    includeTitlesHint: 'Treat quoted strings as search candidates (may misreport)',
    autoScan: 'Scan model replies',
    autoScanHint: 'Add papers found in replies automatically; may produce false positives',
    retryMaxAttempts: 'Download retries',
    fetchTimeoutMs: 'Download timeout (s)',
    conflictStrategy: 'Duplicate strategy',
    conflictStrategyHint: 'What to do when saving hits a similar library entry',
    conflictAsk: 'Always ask (show diff)',
    conflictKeep: 'Keep the library version',
    conflictReplace: 'Overwrite with the new version',
    panelWidth: 'Panel width (px)',
    panelWidthHint: 'Default floating-panel width; drag the edge to resize',
    entryMode: 'Entry placement',
    entryModeHint: 'Auto-merge into the right-sidebar workbench when present; pin to the sidebar footer, or hide entirely',
    customSources: 'Custom download sources',
    customSourcesHint: 'Add mirrors / institutional proxies / private endpoints you trust; URL supports {doi} {arxiv} {isbn} {title} {url}',
    customSourcesCompliance: 'Compliance: these sources are your own configuration and your responsibility; the plugin only requests the addresses you fill in and ships no pirated or infringing source.',
    sourceLabel: 'Name',
    sourceUrlTemplate: 'URL template',
    sourceHeaders: 'Extra headers (one per line, Name: Value)',
    sourceEnabled: 'Enable this source',
    addSource: 'Add custom source',
    addSourceConfirm: 'Add',
    advanced: 'Advanced (external library / import)',
    sectionImport: 'Import',
    importDir: 'Import folder',
    importDirHint: 'PDFs placed here can be scanned into the built-in library manually or automatically',
    watchImport: 'Auto-scan import folder',
    watchImportHint: 'Check every 30s for new PDFs and import them automatically',
    entryAuto: 'Auto (right-sidebar tab preferred)',
    entryFooter: 'Always the sidebar footer button',
    entryHide: 'Hidden (settings page only)',
    readerFit: 'Reader default fit',
    nightMode: 'Night reading mode',
    nightAuto: 'Auto (follow dark theme)',
    nightOn: 'Always on',
    nightOff: 'Off',
    fitWidth: 'Fit width',
    fitPage: 'Fit page',
    zoteroPort: 'Library port',
    dataDir: 'Data directory',
    dataDirHint: 'Detected automatically, can be overridden',
    saved: 'Saved',
    test: 'Test connection',
    testOk: 'Connected',
    testFail: 'Connection failed',
  },
  diff: {
    title: 'A similar entry already exists',
    subtitle: 'Field differences — choose how to proceed:',
    noDiff: 'Fields are identical',
    colField: 'Field',
    colInLibrary: 'In library',
    colIncoming: 'Incoming',
    notSupported: 'The connector API can only create items, not update/overwrite — please handle the overlap in the library app manually',
  },
  cite: {
    title: 'Cite',
    reference: 'Reference list',
    intext: 'In-text citation',
    direct: 'Direct quote (with page)',
    bibtex: 'BibTeX entry',
  },
  search: {
    title: 'Search online',
    scholar: 'Google Scholar',
    baidu: 'Baidu Xueshu',
    cnki: 'CNKI',
    source: 'Source page',
  },
  importMenu: 'Import',
  searchCandidates: {
    title: 'No strict identifier matched — pick a candidate:',
    empty: 'No matches; try the external searches below',
    add: 'Add',
    external: 'Or search externally:',
  },
  dropNoPdf: 'Drop PDF files here',
  dropOk: 'Imported: ',
  importDir: 'Scan import folder',
  importNoDir: 'Configure the import folder in Settings first',
  importNoDirHint: 'folder not configured',
  importZotero: 'Import from local library',
  importZoteroHint: 'needs the library app running',
  importZoteroDown: 'Library not running',
  status: { ready: 'Ready', running: 'Library running', down: 'Library not running' },
  list: {
    selectMode: 'Select',
    selectAll: 'Select all',
    clear: 'Clear selection',
    selectedPrefix: 'Selected',
    exportTitle: 'Export',
    noSelection: 'Select items to export first',
    exported: 'Exported: ',
    tagAdd: 'Add tag (Enter to confirm)',
    tagRemove: 'Remove tag',
  },
  filter: {
    all: 'All',
    pending: 'Not saved',
    saved: 'Saved',
    failed: 'Failed',
    tag: 'Tag',
    sort: 'Sort',
    sortCreated: 'By added time',
    sortTitle: 'By title',
    sortYear: 'By year',
    empty: 'No items match the filters',
  },
  ai: {
    ask: 'Ask AI',
    askHint: 'Ask about this paper — the AI answers from the full text (sent to the current chat)',
    tldr: 'Summarize paper',
    tldrHint: 'Have the AI produce a key-point summary of this paper (sent to the current chat)',
    translate: 'Translate',
    explain: 'Explain',
    summarize: 'Summarize',
    highlight: 'Highlight',
    jump: 'Jump',
    selectionTitle: 'Selection actions',
    placeholder: 'Ask about this paper…',
    sending: 'Sent to the current chat — the AI is answering…',
    noSession: 'No active chat — start a conversation first',
    noText: 'No extractable text in this PDF (may be a scan)',
    noPdf: 'This item has no PDF full text yet',
    selectHint: 'Select text in the reader to translate / explain / summarize',
    toSession: ' (sent to the current chat)',
  },
}

const TABLES = { zh, en }

let currentLocale = 'zh'
const listeners = new Set()

/** User preference from the settings page: 'auto' | 'zh' | 'en'. */
let preference = 'auto'
/** Locale reported by the host runtime (may be null when not exposed). */
let hostLocale = null

/**
 * Reads the host's resolved locale if the runtime exposes one. This is only a
 * *source* — the resolved UI language is decided by resolveLocale(), because an
 * explicit user preference always wins over the host language.
 */
function detectLocale(ctx) {
  try {
    const snap = ctx?.locale?.snapshot?.()
    const code = snap?.locale ?? snap?.language ?? ''
    if (/^en/i.test(code)) return 'en'
    if (/^zh/i.test(code)) return 'zh'
  } catch {
    /* runtime without locale service */
  }
  return null
}

function t(path, params) {
  const parts = String(path).split('.')
  let node = TABLES[currentLocale]
  for (const p of parts) {
    node = node?.[p]
    if (node === undefined) break
  }
  if (node !== undefined && typeof node !== 'object') return interpolate(node, params)
  let fallback = TABLES.zh
  for (const p of parts) {
    fallback = fallback?.[p]
    if (fallback === undefined) break
  }
  return typeof fallback === 'object' ? '' : interpolate(String(fallback ?? path), params)
}

/** Replaces {name} placeholders; undefined values are left visible on purpose
 *  so a missing substitution is obvious in review rather than silently blank. */
function interpolate(template, params) {
  if (!params) return template
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (params[key] != null ? String(params[key]) : m))
}

function setLocale(locale) {
  if (!TABLES[locale] || locale === currentLocale) return
  currentLocale = locale
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* listener gone */
    }
  }
}

/** 'auto' follows the host runtime; 'zh' / 'en' pin the language. */
function setPreference(pref) {
  preference = TABLES[pref] ? pref : 'auto'
  setLocale(resolveLocale())
}

/** Called when the host's own language changes (or on first mount). */
function setHostLocale(locale) {
  hostLocale = TABLES[locale] ? locale : null
  if (preference === 'auto') setLocale(resolveLocale())
}

function resolveLocale() {
  if (TABLES[preference]) return preference
  return hostLocale || 'zh'
}

function getPreference() {
  return preference
}

/**
 * Translates an error for display. The server sends a stable `code` alongside
 * its human-readable `error`; when the code is known we render the translated
 * string, otherwise the raw message is shown so nothing is silently swallowed.
 */
function localizeError(err) {
  if (!err) return ''
  if (err.code) {
    const translated = t(`error.${err.code}`)
    // t() returns the path itself when the key is unknown — treat that as a
    // miss rather than printing "error.WHATEVER" to the user.
    if (translated !== `error.${err.code}`) return translated
  }
  return err.message ?? String(err)
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

module.exports = {
  NS,
  zh,
  en,
  t,
  localizeError,
  setLocale,
  subscribe,
  detectLocale,
  setPreference,
  setHostLocale,
  resolveLocale,
  getPreference,
  currentLocale: () => currentLocale,
}
