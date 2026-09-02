const React = require('react')
const h = React.createElement
const { useState, useSyncExternalStore, useEffect } = React

const store = require('./store.cjs')
const { t, setPreference } = require('./i18n.cjs')
const { Button, Spinner } = require('./ui.cjs')

function useStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

function Field({ label, hint, children }) {
  return h(
    'div',
    { className: 'zt-field' },
    h('label', null, label),
    children,
    hint ? h('div', { className: 'zt-hint' }, hint) : null,
  )
}

function SettingsPage({ close }) {
  const state = useStore()
  const config = state.config ?? {}
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftTemplate, setDraftTemplate] = useState('')
  const [draftHeaders, setDraftHeaders] = useState('')

  useEffect(() => {
    if (form == null && config.saveMode) setForm({ ...config })
  }, [config])

  // All hooks are declared ABOVE this early return: when `form` is still null
  // the component renders fewer hooks, and any hook declared after the return
  // would flip the hook count between renders — React error #310.
  if (!form) return h('div', { className: 'zt-settings' }, h('div', { className: 'zt-empty' }, h(Spinner, { size: 18 })))

  const set = (patch) => setForm({ ...form, ...patch })
  const persist = async () => {
    await store.saveConfig(form)
    // Applying the configured panel width immediately keeps the setting honest.
    if (form.panelWidth && form.panelWidth !== (store.getSnapshot().geometry.width ?? 380)) {
      store.setGeometry({ width: form.panelWidth })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult('')
    try {
      // `refresh` updates the store rather than returning the payload; read the
      // fresh status from the snapshot afterwards.
      await store.refresh()
      const zotero = store.getSnapshot().zotero
      setTestResult(zotero?.running ? t('settings.testOk') : t('settings.testFail'))
    } catch {
      setTestResult(t('settings.testFail'))
    } finally {
      setTesting(false)
    }
  }

  const parseHeaders = (text) => {
    const out = {}
    for (const line of String(text || '').split(/\r?\n/)) {
      const i = line.indexOf(':')
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    return out
  }
  const setSource = (idx, patch) => {
    const list = (form.customSources ?? []).slice()
    list[idx] = { ...list[idx], ...patch }
    set({ customSources: list })
  }
  const removeSource = (idx) => {
    set({ customSources: (form.customSources ?? []).filter((_, i) => i !== idx) })
  }
  const addSource = () => setAddingSource(true)
  const commitSource = () => {
    const src = {
      id: `src_${Date.now().toString(36)}`,
      label: draftLabel,
      urlTemplate: draftTemplate,
      headers: parseHeaders(draftHeaders),
      enabled: true,
      order: 100 + (form.customSources ?? []).length,
    }
    if (!src.label || !src.urlTemplate) return
    set({ customSources: [...(form.customSources ?? []), src] })
    setDraftLabel('')
    setDraftTemplate('')
    setDraftHeaders('')
    setAddingSource(false)
  }

  const toggle = (key) => (e) => set({ [key]: e.target.checked })
  const number = (key, fallback, min, max) => (e) => {
    const v = Number(e.target.value)
    set({ [key]: Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback })
  }

  return h(
    'div',
    { className: 'zt-settings' },
    h('div', { className: 'zt-row', style: { marginBottom: 16, justifyContent: 'space-between' } },
      h('span', { style: { fontSize: 14, fontWeight: 500 } }, t('settings.title')),
      h('div', { className: 'zt-row' },
        h(Button, { variant: 'primary', onClick: persist }, saved ? t('settings.saved') : t('action.confirm')),
        close ? h(Button, { variant: 'ghost', onClick: close }, t('back')) : null,
      ),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.sectionLanguage')),
    h(Field, { label: t('settings.uiLanguage'), hint: t('settings.uiLanguageHint') },
      h(
        'select',
        {
          value: form.uiLanguage ?? 'auto',
          onChange: (e) => {
            const v = e.target.value
            set({ uiLanguage: v })
            // Applied immediately and persisted on its own: waiting for
            // "Confirm" would repaint this page while the button labels and
            // every other string elsewhere were still in the old language.
            setPreference(v)
            store.saveConfig({ uiLanguage: v }).catch(() => {})
          },
        },
        h('option', { value: 'auto' }, t('settings.lang.auto')),
        h('option', { value: 'zh' }, t('settings.lang.zh')),
        h('option', { value: 'en' }, t('settings.lang.en')),
      ),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.sectionSave')),
    h(Field, { label: t('settings.saveMode') },
      h(
        'select',
        { value: form.saveMode, onChange: (e) => set({ saveMode: e.target.value }) },
        h('option', { value: 'builtin' }, t('settings.saveModeBuiltin')),
        h('option', { value: 'zotero' }, t('settings.saveModeZotero')),
        h('option', { value: 'dir' }, t('settings.saveModeDir')),
      ),
    ),
    form.saveMode === 'dir'
      ? h(Field, { label: t('settings.dirPath'), hint: t('settings.dirPathHint') },
          h('input', {
            type: 'text',
            value: form.dirPath ?? '',
            placeholder: 'D:\\Papers',
            onChange: (e) => set({ dirPath: e.target.value }),
          }),
        )
      : null,
    h(Field, { label: t('settings.naming'), hint: t('settings.namingHint') },
      h('input', {
        type: 'text',
        value: form.naming ?? '',
        onChange: (e) => set({ naming: e.target.value }),
      }),
    ),
    h(Field, { label: t('settings.exportFormats'), hint: t('settings.exportFormatsHint') },
      h('div', { className: 'zt-row', style: { gap: 16 } },
        h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 6 } },
          h('input', { type: 'checkbox', checked: (form.exportFormats ?? []).includes('csl-json'), onChange: (e) => {
            const cur = new Set(form.exportFormats ?? [])
            if (e.target.checked) cur.add('csl-json')
            else cur.delete('csl-json')
            set({ exportFormats: [...cur] })
          } }),
          'CSL-JSON',
        ),
        h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 6 } },
          h('input', { type: 'checkbox', checked: (form.exportFormats ?? []).includes('ris'), onChange: (e) => {
            const cur = new Set(form.exportFormats ?? [])
            if (e.target.checked) cur.add('ris')
            else cur.delete('ris')
            set({ exportFormats: [...cur] })
          } }),
          'RIS',
        ),
      ),
    ),
    h(Field, { label: t('settings.tags'), hint: t('settings.tagsHint') },
      h('input', {
        type: 'text',
        value: (form.preferredTags ?? []).join(', '),
        onChange: (e) => set({ preferredTags: e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) }),
      }),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.sectionDetect')),
    h(Field, { label: t('settings.autoResolve'), hint: t('settings.autoResolveHint') },
      h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 8 } },
        h('input', { type: 'checkbox', checked: form.autoResolve !== false, onChange: toggle('autoResolve') }),
        t('settings.autoResolve'),
      ),
    ),
    h(Field, { label: t('settings.includeTitles'), hint: t('settings.includeTitlesHint') },
      h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 8 } },
        h('input', { type: 'checkbox', checked: form.includeTitles !== false, onChange: toggle('includeTitles') }),
        t('settings.includeTitles'),
      ),
    ),
    h(Field, { label: t('settings.autoScan'), hint: t('settings.autoScanHint') },
      h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 8 } },
        h('input', {
          type: 'checkbox',
          checked: !!form.autoScanSession,
          onChange: toggle('autoScanSession'),
        }),
        t('settings.autoScan'),
      ),
    ),
    h(Field, { label: t('settings.retryMaxAttempts') },
      h('input', {
        type: 'number', min: 1, max: 5,
        value: form.retry?.maxAttempts ?? 3,
        onChange: (e) => set({ retry: { ...(form.retry ?? {}), maxAttempts: Number(e.target.value) || 3 } }),
      }),
    ),
    h(Field, { label: t('settings.fetchTimeoutMs') },
      h('input', {
        type: 'number', min: 10, max: 120,
        value: (form.fetchTimeoutMs ?? 30000) / 1000,
        onChange: (e) => set({ fetchTimeoutMs: (Number(e.target.value) || 30) * 1000 }),
      }),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.sectionBehavior')),
    h(Field, { label: t('settings.conflictStrategy'), hint: t('settings.conflictStrategyHint') },
      h(
        'select',
        { value: form.conflictStrategy ?? 'ask', onChange: (e) => set({ conflictStrategy: e.target.value }) },
        h('option', { value: 'ask' }, t('settings.conflictAsk')),
        h('option', { value: 'keep' }, t('settings.conflictKeep')),
        h('option', { value: 'replace' }, t('settings.conflictReplace')),
      ),
    ),
    h(Field, { label: t('settings.panelWidth'), hint: t('settings.panelWidthHint') },
      h('input', {
        type: 'number', min: 300, max: 720,
        value: form.panelWidth ?? 380,
        onChange: number('panelWidth', 380, 300, 720),
      }),
    ),
    h(Field, { label: t('settings.entryMode'), hint: t('settings.entryModeHint') },
      h(
        'select',
        { value: form.entryMode ?? 'auto', onChange: (e) => set({ entryMode: e.target.value }) },
        h('option', { value: 'auto' }, t('settings.entryAuto')),
        h('option', { value: 'footer' }, t('settings.entryFooter')),
        h('option', { value: 'hide' }, t('settings.entryHide')),
      ),
    ),
    h(Field, { label: t('settings.readerFit') },
      h(
        'select',
        { value: form.readerFit ?? 'fit-width', onChange: (e) => set({ readerFit: e.target.value }) },
        h('option', { value: 'fit-width' }, t('settings.fitWidth')),
        h('option', { value: 'fit-page' }, t('settings.fitPage')),
      ),
    ),
    h(Field, { label: t('settings.nightMode') },
      h(
        'select',
        { value: form.nightMode ?? 'auto', onChange: (e) => set({ nightMode: e.target.value }) },
        h('option', { value: 'auto' }, t('settings.nightAuto')),
        h('option', { value: 'on' }, t('settings.nightOn')),
        h('option', { value: 'off' }, t('settings.nightOff')),
      ),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.sectionImport')),
    h(Field, { label: t('settings.importDir'), hint: t('settings.importDirHint') },
      h('input', {
        type: 'text',
        value: form.importDir ?? '',
        placeholder: 'D:\\Papers\\Inbox',
        onChange: (e) => set({ importDir: e.target.value }),
      }),
    ),
    h(Field, { label: t('settings.watchImport'), hint: t('settings.watchImportHint') },
      h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 8 } },
        h('input', { type: 'checkbox', checked: !!form.watchImport, onChange: (e) => set({ watchImport: e.target.checked }) }),
        t('settings.watchImport'),
      ),
    ),

    h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-secondary, #666)', margin: '16px 0 8px' } }, t('settings.customSources')),
    h('div', { className: 'zt-hint', style: { marginBottom: 8 } }, t('settings.customSourcesHint')),
    h('div', { className: 'zt-hint', style: { marginBottom: 8, color: 'var(--dsw-alias-state-warn-primary, #b06000)' } }, t('settings.customSourcesCompliance')),
    (form.customSources ?? []).map((src, idx) =>
      h('div', { key: src.id, className: 'zt-row', style: { gap: 8, marginBottom: 6 } },
        h('input', {
          type: 'checkbox',
          checked: src.enabled !== false,
          title: t('settings.sourceEnabled'),
          onChange: (e) => setSource(idx, { enabled: e.target.checked }),
        }),
        h('input', {
          className: 'zt-input', style: { flex: 0.35, minWidth: 0 },
          value: src.label ?? '',
          placeholder: t('settings.sourceLabel'),
          onChange: (e) => setSource(idx, { label: e.target.value }),
        }),
        h('input', {
          className: 'zt-input', style: { flex: 1, minWidth: 0 },
          value: src.urlTemplate ?? '',
          placeholder: 'https://mirror.example/{doi}',
          onChange: (e) => setSource(idx, { urlTemplate: e.target.value }),
        }),
        h(Button, { variant: 'ghost', onClick: () => removeSource(idx) }, '×'),
      ),
    ),
    h('div', { className: 'zt-row', style: { gap: 8, marginBottom: 4 } },
      h(Button, { onClick: addSource }, t('settings.addSource')),
    ),
    addingSource
      ? h('div', { className: 'zt-field', style: { marginTop: 8 } },
          h('label', null, t('settings.sourceLabel')),
          h('input', { className: 'zt-input', value: draftLabel, placeholder: t('action.sourcePlaceholder'), onChange: (e) => setDraftLabel(e.target.value) }),
          h('label', null, t('settings.sourceUrlTemplate')),
          h('input', { className: 'zt-input', value: draftTemplate, placeholder: 'https://mirror.example/{doi}', onChange: (e) => setDraftTemplate(e.target.value) }),
          h('label', null, t('settings.sourceHeaders')),
          h('textarea', {
            className: 'zt-input', rows: 3, style: { height: 'auto', padding: '8px', fontFamily: 'monospace', fontSize: 12 },
            value: draftHeaders,
            placeholder: 'Authorization: Bearer xxx\nCookie: session=abc',
            onChange: (e) => setDraftHeaders(e.target.value),
          }),
          h('div', { className: 'zt-row', style: { marginTop: 8 } },
            h(Button, { variant: 'primary', onClick: commitSource }, t('settings.addSourceConfirm')),
            h(Button, { variant: 'ghost', onClick: () => setAddingSource(false) }, t('action.cancel')),
          ),
        )
      : null,

    h('details', { className: 'zt-advanced' },
      h('summary', null, t('settings.advanced')),
      h(Field, { label: t('settings.unpaywallEmail'), hint: t('settings.unpaywallEmailHint') },
        h('input', {
          type: 'text',
          value: form.unpaywallEmail ?? '',
          placeholder: 'you@example.com',
          onChange: (e) => set({ unpaywallEmail: e.target.value }),
        }),
      ),
      h(Field, { label: t('settings.zoteroPort') },
        h('input', {
          type: 'number',
          value: form.zoteroPort ?? 23119,
          onChange: (e) => set({ zoteroPort: Number(e.target.value) || 23119 }),
        }),
      ),
      h(Field, { label: t('settings.dataDir'), hint: t('settings.dataDirHint') },
        h('input', {
          type: 'text',
          value: form.dataDirOverride ?? state.zotero?.dataDir ?? '',
          placeholder: state.zotero?.dataDir ?? '',
          onChange: (e) => set({ dataDirOverride: e.target.value }),
        }),
      ),
      h('div', { className: 'zt-row', style: { marginTop: 8 } },
        h(Button, { onClick: testConnection, loading: testing }, t('settings.test')),
        testResult ? h('span', { className: 'zt-hint' }, testResult) : null,
      ),
    ),
  )
}

module.exports = { SettingsPage }
