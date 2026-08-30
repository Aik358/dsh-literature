import { extractIdentifiers } from '../src/node/extract/identifiers.js'
import { buildItem, sameWork, normalizeDoi, arxivBase } from '../src/node/extract/dedupe.js'
import { toZoteroItem } from '../src/node/metadata/normalize.js'
import { renderName } from '../src/node/zotero/naming.js'
import { resolveDataDir } from '../src/node/zotero/data-dir.js'
import { ping, describe } from '../src/node/zotero/health.js'

let failures = 0
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  }
}

const REPLY = `
推荐三篇相关文献：

1. Vaswani et al. 的 Attention Is All You Need，arXiv:1706.03762，是 Transformer 的奠基工作。
2. 最新进展见 DOI: 10.1038/s41586-021-03819-2 (AlphaFold2)。
3. 另可参看 https://arxiv.org/abs/2301.07041v2 以及 10.1145/3442188.3445922。

以上几篇都值得细读。
`

console.log('\n[identifiers]')
const hits = extractIdentifiers(REPLY)
const kinds = hits.map((h) => `${h.kind}:${h.value}`)
console.log('  found:', kinds)
check('finds the arXiv id', hits.some((h) => h.kind === 'arxiv' && h.value === '1706.03762'))
check('finds the DOI after DOI:', hits.some((h) => h.kind === 'doi' && h.value === '10.1038/s41586-021-03819-2'))
check('finds the arxiv.org URL without .pdf', hits.some((h) => h.kind === 'arxiv' && h.value === '2301.07041v2'))
check('finds the bare trailing DOI', hits.some((h) => h.kind === 'doi' && h.value === '10.1145/3442188.3445922'))
check('does not invent identifiers', hits.length <= 6, hits.length)

const withPunctuation = extractIdentifiers('参见 10.1038/s41586-021-03819-2。另外……')
check('trailing CJK punctuation is trimmed', withPunctuation[0]?.value === '10.1038/s41586-021-03819-2', withPunctuation[0])

console.log('\n[dedupe]')
const a = buildItem({ doi: 'https://doi.org/10.1038/s41586-021-03819-2', title: 'Highly accurate protein structure prediction' })
const b = buildItem({ doi: '10.1038/S41586-021-03819-2', title: 'Highly accurate protein structure prediction with AlphaFold' })
const c = buildItem({ doi: '10.1145/3442188.3445922', title: 'Something else entirely' })
check('same DOI with different casing matches', sameWork(a, b))
check('different DOI does not match', !sameWork(a, c))
check('DOI is normalized', normalizeDoi('https://doi.org/10.1038/x') === '10.1038/x', normalizeDoi('https://doi.org/10.1038/x'))
check('arxiv version is stripped for identity', arxivBase('2301.07041v2') === '2301.07041')

console.log('\n[normalize -> zotero item]')
const item = toZoteroItem(
  {
    itemType: 'journalArticle',
    title: '  Highly   accurate protein\nstructure prediction ',
    authors: [{ creatorType: 'author', firstName: 'John', lastName: 'Jumper' }],
    year: 2021,
    container: 'Nature',
    doi: '10.1038/s41586-021-03819-2',
    abstract: 'x',
    arxiv: '2005.12345',
  },
  { clientId: 'abc' },
)
check('uses abstractNote not abstract', item.abstractNote === 'x' && item.abstract === undefined)
check('uses publicationTitle for journals', item.publicationTitle === 'Nature')
check('collapses whitespace in title', item.title === 'Highly accurate protein structure prediction', item.title)
check('carries the client id used by saveAttachment', item.id === 'abc')
check('keeps arXiv id in extra', /arXiv:2005.12345/.test(item.extra ?? ''), item.extra)
check('accessDate is ISO', /^\d{4}-\d{2}-\d{2}T/.test(item.accessDate), item.accessDate)

console.log('\n[naming]')
const name = renderName(
  { authors: [{ lastName: 'Jumper', firstName: 'John' }, { lastName: 'Evans', firstName: 'R' }], year: 2021, title: 'Highly accurate protein structure prediction with AlphaFold' },
  '{author}_{year}_{title}',
)
check('renders the template', name.startsWith('Jumper, John_2021_'), name)
check('strips path separators', !/[\\/:*?"<>|]/.test(name), name)

console.log('\n[zotero environment]')
const dir = await resolveDataDir()
console.log('  dataDir:', dir.dataDir, '| source:', dir.source)
check('data dir is discovered', Boolean(dir.dataDir))
const status = await ping()
console.log('  running:', status.running, status.version ? `| version ${status.version}` : '')
check('ping resolves without throwing', typeof status.running === 'boolean')
const desc = await describe()
console.log('  describe:', JSON.stringify({ running: desc.running, dataDir: desc.dataDir, library: desc.library }))
check('describe returns a shape', typeof desc.dataDir === 'string')

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
