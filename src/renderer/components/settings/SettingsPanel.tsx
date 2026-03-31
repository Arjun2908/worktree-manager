import { useState, useEffect } from 'react'
import { Settings, FolderPlus, X, Save, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSettings, useSaveSettings } from '../../hooks/useWorktrees'
import type { AppSettings } from '../../types'

export function SettingsPanel() {
  const { data: settings } = useSettings()
  const saveSettings = useSaveSettings()

  const [scanRoots, setScanRoots] = useState<string[]>([])
  const [staleThresholdDays, setStaleThresholdDays] = useState(30)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync from loaded settings
  useEffect(() => {
    if (settings) {
      setScanRoots(settings.scanRoots)
      setStaleThresholdDays(settings.staleThresholdDays)
    }
  }, [settings])

  const handleAddDirectory = async () => {
    const dir = await window.api.selectDirectory()
    if (dir && !scanRoots.includes(dir)) {
      setScanRoots([...scanRoots, dir])
      setDirty(true)
    }
  }

  const handleRemoveDirectory = (index: number) => {
    setScanRoots(scanRoots.filter((_, i) => i !== index))
    setDirty(true)
  }

  const handleSave = () => {
    if (!settings) return
    const updated: AppSettings = {
      ...settings,
      scanRoots,
      staleThresholdDays
    }
    saveSettings.mutate(updated, {
      onSuccess: () => {
        setDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  const handleReset = () => {
    if (settings) {
      setScanRoots(settings.scanRoots)
      setStaleThresholdDays(settings.staleThresholdDays)
      setDirty(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-primary/10">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <p className="text-xs text-text-tertiary">Configure scan directories and preferences</p>
        </div>
      </div>

      {/* Scan directories */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Scan Directories</h3>
          <p className="text-xs text-text-tertiary mt-1">
            The app will recursively search these directories for Git repositories with worktrees.
          </p>
        </div>

        <div className="space-y-2">
          {scanRoots.map((dir, i) => (
            <div
              key={dir}
              className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 group"
            >
              <span className="flex-1 font-mono text-xs text-text-secondary truncate" title={dir}>
                {dir}
              </span>
              <button
                onClick={() => handleRemoveDirectory(i)}
                className="p-1 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                title="Remove directory"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {scanRoots.length === 0 && (
            <div className="text-xs text-text-faint italic py-2">
              No directories configured. Add one below.
            </div>
          )}
        </div>

        <button
          onClick={handleAddDirectory}
          className="flex items-center gap-2 px-3 py-2 border border-dashed border-border-strong rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 hover:bg-primary/5 transition-all w-full justify-center"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Add Directory
        </button>
      </motion.div>

      {/* Stale threshold */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.2 }}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Stale Threshold</h3>
          <p className="text-xs text-text-tertiary mt-1">
            Worktrees with no modifications in this many days are marked as stale.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={365}
            value={staleThresholdDays}
            onChange={(e) => {
              setStaleThresholdDays(Number(e.target.value))
              setDirty(true)
            }}
            className="w-20 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <span className="text-xs text-text-tertiary">days</span>
        </div>
      </motion.div>

      {/* Save bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
        className="flex items-center justify-end gap-3"
      >
        {saved && (
          <motion.span
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs text-emerald-500 font-medium"
          >
            Settings saved — rescan to apply
          </motion.span>
        )}
        {dirty && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs rounded-lg hover:bg-surface-hover transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          Save Settings
        </button>
      </motion.div>
    </div>
  )
}
