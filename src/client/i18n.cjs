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
    openSource: '打开来源',
    openLoginPage: '打开登录页',
    importPdf: '导入本地 PDF',
    importPdfHint: '在浏览器登录并下载 PDF 后，从这里选择文件导入',
    launch: '启动文献库',
    saveAnyway: '仍然保存',
  },
  banner: {
    zoteroDown: '文献库未运行，无法读取或写入条目',
    zoteroDownDir: '文献库未运行，可改为导出到目录',
    offline: '宿主不可达',
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
    loading: '正在加载 PDF…',
    notDownloaded: '全文尚未下载',
    addNote: '添加笔记',
    deleteAnnotation: '删除',
  },
  settings: {
    title: '文献侧窗设置',
    sectionSave: '保存与导出',
    sectionDetect: '识别与下载',
    sectionBehavior: '行为与界面',
    sectionLibrary: '本地文献库',
    saveMode: '保存方式',
    saveModeZotero: '写入本地文献库',
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
    readerFit: '阅读器默认缩放',
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
  },
  status: { ready: '就绪', running: '文献库运行中', down: '文献库未运行' },
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
    openSource: 'Open source',
    openLoginPage: 'Open login page',
    importPdf: 'Import local PDF',
    importPdfHint: 'After signing in and downloading the PDF in your browser, pick the file here',
    launch: 'Launch library',
    saveAnyway: 'Save anyway',
  },
  banner: {
    zoteroDown: 'Library is not running — cannot read or write items',
    zoteroDownDir: 'Library is not running — you can export to a folder instead',
    offline: 'Host unreachable',
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
    loading: 'Loading PDF…',
    notDownloaded: 'Full text not downloaded yet',
    addNote: 'Add note',
    deleteAnnotation: 'Delete',
  },
  settings: {
    title: 'Literature panel settings',
    sectionSave: 'Saving & export',
    sectionDetect: 'Detection & download',
    sectionBehavior: 'Behaviour & UI',
    sectionLibrary: 'Local library',
    saveMode: 'Save target',
    saveModeZotero: 'Write to local library',
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
    readerFit: 'Reader default fit',
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
  },
  status: { ready: 'Ready', running: 'Library running', down: 'Library not running' },
}

const TABLES = { zh, en }

let currentLocale = 'zh'
const listeners = new Set()

/** Reads the host's resolved locale if the runtime exposes one. */
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

function t(path) {
  const parts = String(path).split('.')
  let node = TABLES[currentLocale]
  for (const p of parts) {
    node = node?.[p]
    if (node === undefined) break
  }
  if (node !== undefined && typeof node !== 'object') return node
  let fallback = TABLES.zh
  for (const p of parts) {
    fallback = fallback?.[p]
    if (fallback === undefined) break
  }
  return typeof fallback === 'object' ? '' : String(fallback ?? path)
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

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

module.exports = { NS, zh, en, t, setLocale, subscribe, detectLocale, currentLocale: () => currentLocale }
