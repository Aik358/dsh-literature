const React = require('react')
const h = React.createElement
const { useState, useSyncExternalStore, useEffect } = React

const store = require('./store.cjs')
const { t } = require('./i18n.cjs')
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

  useEffect(() => {
    if (form == null && config.saveMode) setForm({ ...config })
  }, [config])

  if (!form) return h('div', { className: 'zt-settings' }, h('div', { className: 'zt-empty' }, h(Spinner, { size: 18 })))

  const set = (patch) => setForm({ ...form, ...patch })
  const persist = async () => {
    await store.saveConfig(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult('')
    try {
      const { zotero } = await store.refresh()
      setTestResult(zotero?.running ? t('settings.testOk') : t('settings.testFail'))
    } catch {
      setTestResult(t('settings.testFail'))
    } finally {
      setTesting(false)
    }
  }

  return h(
    'div',
    { className: 'zt-settings' },
    h('div', { className: 'zt-row', style: { marginBottom: 16, justifyContent: 'space-between' } },
      h('span', { style: { fontSize: 14, fontWeight: 500 } }, t('settings.title')),
      h('div', { className: 'zt-row' },
        h(Button, { variant: 'primary', onClick: persist }, t('settings.saved')),
        close ? h(Button, { variant: 'ghost', onClick: close }, t('back')) : null,
      ),
    ),

    h(Field, { label: t('settings.saveMode') },
      h(
        'select',
        { value: form.saveMode, onChange: (e) => set({ saveMode: e.target.value }) },
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

    h(Field, { label: t('settings.tags'), hint: t('settings.tagsHint') },
      h('input', {
        type: 'text',
        value: (form.preferredTags ?? []).join(', '),
        onChange: (e) => set({ preferredTags: e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) }),
      }),
    ),

    h(Field, { label: t('settings.unpaywallEmail'), hint: t('settings.unpaywallEmailHint') },
      h('input', {
        type: 'text',
        value: form.unpaywallEmail ?? '',
        placeholder: 'you@example.com',
        onChange: (e) => set({ unpaywallEmail: e.target.value }),
      }),
    ),

    h(Field, { label: t('settings.autoScan'), hint: t('settings.autoScanHint') },
      h('label', { className: 'zt-row', style: { cursor: 'pointer', gap: 8 } },
        h('input', {
          type: 'checkbox',
          checked: !!form.autoScanSession,
          onChange: (e) => set({ autoScanSession: e.target.checked }),
        }),
        t('settings.autoScan'),
      ),
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
  )
}

module.exports = { SettingsPage }
