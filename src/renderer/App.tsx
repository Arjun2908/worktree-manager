import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from './stores/app-store'
import { useRefreshData, useSettings, useWorktrees } from './hooks/useWorktrees'
import { useSelection } from './hooks/useSelection'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { WorktreeWorkspace } from './components/worktrees/WorktreeWorkspace'
import { StashBrowser } from './components/stashes/StashBrowser'
import { SettingsPanel } from './components/settings/SettingsPanel'
import type { Worktree } from './types'

export default function App() {
  const {
    currentView,
    selectedRepo,
    hideMainWorktrees,
    sourceFilter,
    statusFilter,
    searchQuery,
    sortBy,
    sortDirection,
    theme,
    setTheme,
    setHideMainWorktrees,
    setSelectedRepo,
    setWorktreeView,
    setCurrentView
  } = useAppStore()
  const { data: settings } = useSettings()
  const scanRoots = settings?.scanRoots || []
  const staleThresholdDays = settings?.staleThresholdDays || 30
  const {
    data: scanResult,
    isLoading,
    isFetching,
    isHydratingDiskUsage,
    error,
    scanProgress
  } = useWorktrees(scanRoots, staleThresholdDays)
  const { refresh, isRefreshing } = useRefreshData()
  const selection = useSelection()
  const didInitializeSettings = useRef(false)
  const didInitializeRepoScope = useRef(false)

  useEffect(() => {
    if (!settings) return
    setTheme(settings.theme)
    setHideMainWorktrees(!settings.showMainWorktrees)
    if (!didInitializeSettings.current) {
      didInitializeSettings.current = true
      setWorktreeView(settings.defaultView)
    }
  }, [settings, setTheme, setHideMainWorktrees, setWorktreeView])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const allWorktrees = useMemo(
    () => scanResult?.repos.flatMap((repo) => repo.worktrees) || [],
    [scanResult]
  )

  const scopedWorktrees = useMemo(() => {
    let worktrees = allWorktrees
    if (hideMainWorktrees) worktrees = worktrees.filter((worktree) => !worktree.isMainWorktree)
    if (selectedRepo) worktrees = worktrees.filter((worktree) => worktree.repoPath === selectedRepo)
    return worktrees
  }, [allWorktrees, hideMainWorktrees, selectedRepo])

  useEffect(() => {
    if (didInitializeRepoScope.current || !scanResult || isFetching || error) return
    const reposWithLinkedWorktrees = scanResult.repos.filter((repo) =>
      repo.worktrees.some((worktree) => !worktree.isMainWorktree)
    )
    if (reposWithLinkedWorktrees.length === 0) return
    didInitializeRepoScope.current = true
    if (reposWithLinkedWorktrees.length === 1) {
      setSelectedRepo(reposWithLinkedWorktrees[0].path)
    }
  }, [scanResult, isFetching, error, setSelectedRepo])

  const filteredWorktrees = useMemo(() => {
    let worktrees: Worktree[] = [...scopedWorktrees]

    if (sourceFilter !== 'all') {
      worktrees = worktrees.filter((worktree) => worktree.source === sourceFilter)
    }
    if (statusFilter === 'safe') {
      worktrees = worktrees.filter((worktree) => worktree.safety.level === 'safe' && !worktree.isMainWorktree)
    } else if (statusFilter === 'review') {
      worktrees = worktrees.filter((worktree) => worktree.safety.level !== 'safe' && !worktree.isMainWorktree)
    } else if (statusFilter !== 'all') {
      worktrees = worktrees.filter((worktree) => worktree.statuses.includes(statusFilter))
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      worktrees = worktrees.filter((worktree) =>
        worktree.path.toLowerCase().includes(query)
        || worktree.branch?.toLowerCase().includes(query)
        || worktree.repoName.toLowerCase().includes(query)
        || worktree.summary.toLowerCase().includes(query)
      )
    }

    worktrees.sort((left, right) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = left.repoName.localeCompare(right.repoName)
          break
        case 'branch':
          comparison = (left.branch || '').localeCompare(right.branch || '')
          break
        case 'lastModified':
          comparison = (left.lastModified || '').localeCompare(right.lastModified || '')
          break
        case 'diskSize':
          comparison = (left.diskSize || 0) - (right.diskSize || 0)
          break
        case 'source':
          comparison = left.source.localeCompare(right.source)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return worktrees
  }, [scopedWorktrees, sourceFilter, statusFilter, searchQuery, sortBy, sortDirection])

  useEffect(() => {
    selection.reconcile(allWorktrees
      .filter((worktree) => !worktree.isMainWorktree)
      .map((worktree) => worktree.id))
  }, [allWorktrees, selection.reconcile])

  useEffect(() => {
    if (!selectedRepo || !scanResult || isFetching || error) return
    if (!scanResult.repos.some((repo) => repo.path === selectedRepo)) {
      setSelectedRepo(null)
    }
  }, [selectedRepo, scanResult, isFetching, error, setSelectedRepo])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        if (!isRefreshing && !isHydratingDiskUsage) void refresh()
      } else if (event.metaKey && event.key.toLowerCase() === 'f' && currentView === 'worktrees') {
        event.preventDefault()
        const search = document.getElementById('worktree-search') as HTMLInputElement | null
        search?.focus()
        search?.select()
      } else if (event.key === 'Escape') {
        selection.deselectAll()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [currentView, isHydratingDiskUsage, isRefreshing, refresh, selection.deselectAll])

  const queryError = error instanceof Error ? error : error ? new Error(String(error)) : null
  const selectedRepoName = selectedRepo
    ? scanResult?.repos.find((repo) => repo.path === selectedRepo)?.name ?? null
    : null

  return (
    <div className="app-shell">
      <Sidebar
        repos={scanResult?.repos || []}
        totalWorktrees={scanResult?.totalWorktrees || 0}
        totalDiskUsage={scanResult?.totalDiskUsage || 0}
        isLoading={isLoading}
      />

      <div className="app-main">
        <Header
          isLoading={isLoading}
          isFetching={isRefreshing}
          isHydratingDiskUsage={isHydratingDiskUsage}
          scanProgress={scanProgress}
          error={queryError}
          onRefresh={() => { if (!isRefreshing && !isHydratingDiskUsage) void refresh() }}
          worktreeCount={filteredWorktrees.length}
          totalCount={scopedWorktrees.length}
        />

        <main className={`app-content app-content-${currentView}`}>
          {currentView === 'dashboard' ? (
            <Dashboard
              scanResult={scanResult || null}
              isLoading={isLoading}
              isFetching={isFetching || isHydratingDiskUsage}
              error={queryError}
              onRetry={() => { if (!isRefreshing) void refresh() }}
            />
          ) : currentView === 'settings' ? (
            <SettingsPanel />
          ) : currentView === 'stashes' ? (
            <StashBrowser repos={scanResult?.repos || []} />
          ) : (
            <WorktreeWorkspace
              worktrees={filteredWorktrees}
              scopedWorktrees={scopedWorktrees}
              isLoading={isLoading}
              isFetching={isFetching}
              error={queryError}
              selection={selection}
              scopeKey={selectedRepo}
              selectedRepoName={selectedRepoName}
              onRetry={() => { if (!isRefreshing) void refresh() }}
              onOpenSettings={() => setCurrentView('settings')}
            />
          )}
        </main>
      </div>
    </div>
  )
}
