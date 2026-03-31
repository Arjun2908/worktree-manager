import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from './stores/app-store'
import { useWorktrees, useSettings } from './hooks/useWorktrees'
import { useSelection } from './hooks/useSelection'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { WorktreeList } from './components/worktrees/WorktreeList'
import { StashBrowser } from './components/stashes/StashBrowser'
import { SettingsPanel } from './components/settings/SettingsPanel'
import type { Worktree } from './types'

export default function App() {
  const { currentView, selectedRepo, hideMainWorktrees, sourceFilter, statusFilter, searchQuery, sortBy, sortDirection, theme } = useAppStore()
  const { data: settings } = useSettings()
  const scanRoots = settings?.scanRoots || []
  const { data: scanResult, isLoading, refetch, scanProgress } = useWorktrees(scanRoots)
  const selection = useSelection()

  // Apply theme
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else if (theme === 'light') {
      root.classList.remove('dark')
      root.classList.add('light')
    } else {
      // System theme - default to dark
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
      root.classList.toggle('light', !prefersDark)
    }
  }, [theme])

  // Filter and sort worktrees
  const filteredWorktrees = useMemo(() => {
    if (!scanResult) return []

    let worktrees: Worktree[] = scanResult.repos.flatMap((r) => r.worktrees)

    if (hideMainWorktrees) {
      worktrees = worktrees.filter((w) => !w.isMainWorktree)
    }

    if (selectedRepo) {
      worktrees = worktrees.filter((w) => w.repoName === selectedRepo)
    }

    if (sourceFilter !== 'all') {
      worktrees = worktrees.filter((w) => w.source === sourceFilter)
    }

    if (statusFilter === 'safe') {
      worktrees = worktrees.filter((w) => w.safety.level === 'safe' && !w.isMainWorktree)
    } else if (statusFilter !== 'all') {
      worktrees = worktrees.filter((w) => w.statuses.includes(statusFilter))
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      worktrees = worktrees.filter(
        (w) =>
          w.path.toLowerCase().includes(q) ||
          w.branch?.toLowerCase().includes(q) ||
          w.repoName.toLowerCase().includes(q)
      )
    }

    // Sort
    worktrees.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = a.repoName.localeCompare(b.repoName)
          break
        case 'branch':
          cmp = (a.branch || '').localeCompare(b.branch || '')
          break
        case 'lastModified':
          cmp = (a.lastModified || '').localeCompare(b.lastModified || '')
          break
        case 'diskSize':
          cmp = (a.diskSize || 0) - (b.diskSize || 0)
          break
        case 'source':
          cmp = a.source.localeCompare(b.source)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return worktrees
  }, [scanResult, hideMainWorktrees, selectedRepo, sourceFilter, statusFilter, searchQuery, sortBy, sortDirection])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'r') {
        e.preventDefault()
        refetch()
      }
      if (e.key === 'Escape') {
        selection.deselectAll()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [refetch, selection])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Title bar drag region */}
      <div className="titlebar-drag h-12 flex-shrink-0 flex items-center px-20">
        <span className="text-xs font-medium text-text-faint titlebar-no-drag">
          Worktree Manager
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          repos={scanResult?.repos || []}
          totalWorktrees={scanResult?.totalWorktrees || 0}
          totalDiskUsage={scanResult?.totalDiskUsage || 0}
          isLoading={isLoading}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            isLoading={isLoading}
            scanProgress={scanProgress}
            onRefresh={() => refetch()}
            worktreeCount={filteredWorktrees.length}
            totalCount={filteredWorktrees.length}
          />

          <main className="flex-1 overflow-auto p-6">
            <AnimatePresence mode="wait">
              {currentView === 'dashboard' ? (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <Dashboard
                    scanResult={scanResult || null}
                    isLoading={isLoading}
                  />
                </motion.div>
              ) : currentView === 'settings' ? (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <SettingsPanel />
                </motion.div>
              ) : currentView === 'stashes' ? (
                <motion.div
                  key="stashes"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <StashBrowser repos={scanResult?.repos || []} />
                </motion.div>
              ) : (
                <motion.div
                  key="worktrees"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <WorktreeList
                    worktrees={filteredWorktrees}
                    isLoading={isLoading}
                    selection={selection}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}
