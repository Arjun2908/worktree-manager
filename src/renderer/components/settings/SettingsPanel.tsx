import { useEffect, useMemo, useState } from 'react'
import { FolderPlus, Save, Trash2 } from 'lucide-react'
import { useSettings, useSaveSettings } from '../../hooks/useWorktrees'
import { useAppStore } from '../../stores/app-store'
import type { AppSettings } from '../../types'

export function SettingsPanel() {
  const { data: settings, isLoading } = useSettings()
  const saveSettings = useSaveSettings()
  const { setTheme, setHideMainWorktrees } = useAppStore()
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'refreshing' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  const dirty = useMemo(
    () => Boolean(settings && draft && JSON.stringify(settings) !== JSON.stringify(draft)),
    [settings, draft]
  )

  if (isLoading || !draft) {
    return (
      <div className="initial-loading" role="status">
        <span className="native-spinner" aria-hidden="true" />
        <p>Loading settings…</p>
      </div>
    )
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setSaveStatus(null)
    setError(null)
  }

  const handleAddDirectory = async () => {
    const directory = await window.api.selectDirectory()
    if (directory && !draft.scanRoots.includes(directory)) {
      update('scanRoots', [...draft.scanRoots, directory])
    }
  }

  const handleSave = async () => {
    if (!settings) return
    const normalized: AppSettings = {
      ...draft,
      staleThresholdDays: Math.max(1, Math.min(365, draft.staleThresholdDays))
    }
    const scanSettingsChanged = normalized.staleThresholdDays !== settings.staleThresholdDays
      || normalized.scanRoots.length !== settings.scanRoots.length
      || normalized.scanRoots.some((root, index) => root !== settings.scanRoots[index])
    setError(null)
    setSaveStatus(null)
    try {
      await saveSettings.mutateAsync(normalized)
      setDraft(normalized)
      setTheme(normalized.theme)
      setHideMainWorktrees(!normalized.showMainWorktrees)
      setSaveStatus(scanSettingsChanged ? 'refreshing' : 'saved')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Settings could not be saved.')
    }
  }

  return (
    <section className="settings-panel" aria-label="Worktree Manager settings">
      <div className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h3>Scan locations</h3>
            <p>Repositories are discovered recursively inside these folders.</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={handleAddDirectory}
            disabled={saveSettings.isPending}
          >
            <FolderPlus aria-hidden="true" /> Add folder
          </button>
        </div>

        <div className="scan-root-list">
          {draft.scanRoots.length === 0 ? (
            <p className="empty-setting">No folders configured. Add a folder to discover worktrees.</p>
          ) : draft.scanRoots.map((directory) => (
            <div key={directory}>
              <code title={directory}>{directory}</code>
              <button
                type="button"
                className="toolbar-icon-button"
                onClick={() => update('scanRoots', draft.scanRoots.filter((root) => root !== directory))}
                disabled={saveSettings.isPending}
                aria-label={`Remove ${directory}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <label htmlFor="stale-threshold">
            <strong>Mark inactive after</strong>
            <small>Used for the stale-worktree filter. Local changes are always called out separately.</small>
          </label>
          <div className="number-field">
            <input
              id="stale-threshold"
              type="number"
              min={1}
              max={365}
              value={draft.staleThresholdDays}
              onChange={(event) => update('staleThresholdDays', Number(event.target.value))}
              disabled={saveSettings.isPending}
            />
            <span>days</span>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <strong>Appearance</strong>
            <small>System follows the current macOS appearance.</small>
          </div>
          <div className="segmented-control" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                type="button"
                key={theme}
                aria-pressed={draft.theme === theme}
                onClick={() => update('theme', theme)}
                disabled={saveSettings.isPending}
              >
                {theme.charAt(0).toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <strong>Default worktree view</strong>
            <small>Board groups worktrees by removal safety. List keeps the dense comparison table.</small>
          </div>
          <div className="segmented-control" role="group" aria-label="Default worktree view">
            {(['board', 'table'] as const).map((view) => (
              <button
                type="button"
                key={view}
                aria-pressed={draft.defaultView === view}
                onClick={() => update('defaultView', view)}
                disabled={saveSettings.isPending}
              >
                {view === 'table' ? 'List' : 'Board'}
              </button>
            ))}
          </div>
        </div>

        <label className="settings-row settings-checkbox-row">
          <span>
            <strong>Show main checkouts by default</strong>
            <small>Main checkouts are protected and can never be removed from the app.</small>
          </span>
          <input
            type="checkbox"
            checked={draft.showMainWorktrees}
            onChange={(event) => update('showMainWorktrees', event.target.checked)}
            disabled={saveSettings.isPending}
          />
        </label>
      </div>

      <footer className="settings-savebar">
        <span role="status" aria-live="polite">
          {error
            || (saveStatus === 'refreshing'
              ? 'Settings saved. Worktrees are refreshing.'
              : saveStatus === 'saved'
                ? 'Settings saved.'
                : dirty ? 'Unsaved changes' : 'Up to date')}
        </span>
        {dirty && (
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setDraft(settings || draft)
              setSaveStatus(null)
              setError(null)
            }}
            disabled={saveSettings.isPending}
          >
            Revert
          </button>
        )}
        <button
          type="button"
          className="button-primary"
          onClick={handleSave}
          disabled={!dirty || saveSettings.isPending}
        >
          <Save aria-hidden="true" />
          {saveSettings.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </footer>
    </section>
  )
}
