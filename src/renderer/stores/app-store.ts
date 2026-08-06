import { create } from 'zustand'
import type { WorktreeSource, WorktreeStatus, WorktreeView } from '../types'

interface AppState {
  currentView: 'dashboard' | 'worktrees' | 'stashes' | 'settings'
  worktreeView: WorktreeView
  selectedRepo: string | null
  stashRepo: string | null
  sourceFilter: WorktreeSource | 'all'
  statusFilter: WorktreeStatus | 'all' | 'safe' | 'review'
  sortBy: 'name' | 'branch' | 'lastModified' | 'diskSize' | 'source'
  sortDirection: 'asc' | 'desc'
  searchQuery: string
  hideMainWorktrees: boolean
  theme: 'dark' | 'light' | 'system'
  lastScanTime: number | null
  showScanComplete: boolean

  setCurrentView: (view: 'dashboard' | 'worktrees' | 'stashes' | 'settings') => void
  setWorktreeView: (view: WorktreeView) => void
  setSelectedRepo: (repoPath: string | null) => void
  setStashRepo: (repo: string | null) => void
  setSourceFilter: (source: WorktreeSource | 'all') => void
  setStatusFilter: (status: WorktreeStatus | 'all' | 'safe' | 'review') => void
  setSortBy: (sort: AppState['sortBy']) => void
  toggleSortDirection: () => void
  setSearchQuery: (query: string) => void
  setHideMainWorktrees: (hide: boolean) => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setLastScanTime: (time: number) => void
  setShowScanComplete: (show: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'worktrees',
  worktreeView: 'board',
  selectedRepo: null,
  stashRepo: null,
  sourceFilter: 'all',
  statusFilter: 'all',
  sortBy: 'lastModified',
  sortDirection: 'desc',
  searchQuery: '',
  hideMainWorktrees: true,
  theme: 'system',
  lastScanTime: null,
  showScanComplete: false,

  setCurrentView: (view) => set({ currentView: view }),
  setWorktreeView: (worktreeView) => set({ worktreeView }),
  // Only set currentView to worktrees when selecting a specific repo, not when clearing
  setSelectedRepo: (repoPath) => set(repoPath
    ? { selectedRepo: repoPath, currentView: 'worktrees' }
    : { selectedRepo: null }),
  setStashRepo: (repo) => set({ stashRepo: repo, currentView: 'stashes' }),
  setSourceFilter: (source) => set({ sourceFilter: source }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortDirection: () => set((s) => ({ sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc' })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHideMainWorktrees: (hide) => set({ hideMainWorktrees: hide }),
  setTheme: (theme) => set({ theme }),
  setLastScanTime: (time) => set({ lastScanTime: time }),
  setShowScanComplete: (show) => set({ showScanComplete: show })
}))
