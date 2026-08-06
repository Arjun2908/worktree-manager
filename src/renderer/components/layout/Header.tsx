import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Monitor, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'
import { useSaveSettings, useSettings } from '../../hooks/useWorktrees'
import { Tooltip } from '../ui/Tooltip'
import { cn } from '../../lib/utils'

interface HeaderProps {
  isLoading: boolean
  isFetching?: boolean
  isHydratingDiskUsage?: boolean
  scanProgress: { current: number; total: number; repo: string } | null
  error?: Error | null
  onRefresh: () => void
  worktreeCount: number
  totalCount: number
}

const viewTitles = {
  dashboard: 'Overview',
  worktrees: 'Worktrees',
  stashes: 'Stashes',
  settings: 'Settings'
} as const

export function Header({
  isLoading,
  isFetching,
  isHydratingDiskUsage = false,
  scanProgress,
  error = null,
  onRefresh,
  worktreeCount,
  totalCount
}: HeaderProps) {
  const {
    searchQuery,
    setSearchQuery,
    currentView,
    theme,
    setTheme
  } = useAppStore()
  const { data: settings } = useSettings()
  const saveSettings = useSaveSettings()
  const [showDone, setShowDone] = useState(false)
  const wasFetching = useRef(false)
  const [themeError, setThemeError] = useState<string | null>(null)
  const fetching = isLoading || Boolean(isFetching)
  const working = fetching || isHydratingDiskUsage

  useEffect(() => {
    if (working) {
      wasFetching.current = true
      setShowDone(false)
      return
    }
    if (!wasFetching.current) {
      if (error) setShowDone(false)
      return
    }
    wasFetching.current = false
    if (error) {
      setShowDone(false)
      return
    }
    setShowDone(true)
    const timer = window.setTimeout(() => setShowDone(false), 1800)
    return () => window.clearTimeout(timer)
  }, [working, error])

  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
  const themeName = theme === 'system' ? 'System appearance' : `${theme[0].toUpperCase()}${theme.slice(1)} appearance`
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  const themeDisabled = currentView === 'settings' || !settings || saveSettings.isPending
  const themeTooltip = currentView === 'settings'
    ? 'Change appearance using Settings.'
    : `${themeName}. Switch to ${nextTheme}.`

  const handleThemeChange = async () => {
    if (themeDisabled || !settings) return
    const previousTheme = theme
    setThemeError(null)
    setTheme(nextTheme)
    try {
      await saveSettings.mutateAsync({ ...settings, theme: nextTheme })
    } catch (saveError) {
      setTheme(previousTheme)
      setThemeError(saveError instanceof Error ? saveError.message : 'Appearance could not be saved.')
    }
  }

  return (
    <header className={cn('app-toolbar', currentView === 'worktrees' && 'app-toolbar-worktrees')}>
      <div className="app-toolbar-leading">
        {currentView !== 'worktrees' && <h1>{viewTitles[currentView]}</h1>}
      </div>

      {currentView === 'worktrees' && (
        <label className="global-worktree-search">
          <span className="sr-only">Search worktrees</span>
          <Search aria-hidden="true" />
          <input
            id="worktree-search"
            type="search"
            placeholder="Search worktrees"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery ? (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear worktree search">
              <X aria-hidden="true" />
            </button>
          ) : (
            <kbd>⌘F</kbd>
          )}
        </label>
      )}

      <div className="app-toolbar-trailing">
        <div className="toolbar-status" aria-live="polite" aria-atomic="true">
          {working ? (
            <span>
              <span className="native-spinner" aria-hidden="true" />
              <span>
                {isHydratingDiskUsage && !fetching
                  ? 'Measuring disk usage'
                  : scanProgress
                  ? scanProgress.current === 0
                    ? 'Preparing repositories'
                    : `Scanned ${scanProgress.repo}`
                  : 'Refreshing'}
              </span>
              {fetching && scanProgress && <code>{scanProgress.current}/{scanProgress.total}</code>}
            </span>
          ) : error ? (
            <span className="toolbar-status-error" title={error.message}>
              <AlertTriangle aria-hidden="true" /> Refresh failed
            </span>
          ) : themeError ? (
            <span className="toolbar-status-error" title={themeError}>
              <AlertTriangle aria-hidden="true" /> Appearance wasn’t saved
            </span>
          ) : showDone ? (
            <span className="toolbar-status-safe">
              <Check aria-hidden="true" /> Up to date
            </span>
          ) : currentView === 'worktrees' ? (
            <span className="toolbar-result-count">
              {worktreeCount === totalCount
                ? `${worktreeCount} shown`
                : `${worktreeCount} of ${totalCount}`}
            </span>
          ) : null}
        </div>

        <Tooltip text={themeTooltip} position="below">
          <button
            type="button"
            onClick={() => void handleThemeChange()}
            disabled={themeDisabled}
            aria-label={`${themeName}. Switch to ${nextTheme} appearance.`}
            aria-busy={saveSettings.isPending}
            className="toolbar-icon-button"
          >
            <ThemeIcon aria-hidden="true" />
          </button>
        </Tooltip>

        <Tooltip text="Rescan all repositories (Command-R)" position="below">
          <button
            type="button"
            onClick={onRefresh}
            disabled={working}
            aria-label="Rescan all repositories"
            aria-busy={working}
            className="toolbar-icon-button"
          >
            <RefreshCw className={working ? 'animate-spin' : undefined} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </header>
  )
}
