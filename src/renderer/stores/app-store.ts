import { create } from 'zustand'
import type { WorktreeSource, WorktreeStatus } from '../types'

interface AppState {
  currentView: 'dashboard' | 'worktrees' | 'stashes'
  selectedRepo: string | null
  stashRepo: string | null
  sourceFilter: WorktreeSource | 'all'
  statusFilter: WorktreeStatus | 'all' | 'safe'
  sortBy: 'name' | 'branch' | 'lastModified' | 'diskSize' | 'source'
  sortDirection: 'asc' | 'desc'
  searchQuery: string
  hideMainWorktrees: boolean
  viewMode: 'card' | 'table'
  theme: 'dark' | 'light' | 'system'
  lastScanTime: number | null
  showScanComplete: boolean

  setCurrentView: (view: 'dashboard' | 'worktrees' | 'stashes') => void
  setSelectedRepo: (repo: string | null) => void
  setStashRepo: (repo: string | null) => void
  setSourceFilter: (source: WorktreeSource | 'all') => void
  setStatusFilter: (status: WorktreeStatus | 'all' | 'safe') => void
  setSortBy: (sort: AppState['sortBy']) => void
  toggleSortDirection: () => void
  setSearchQuery: (query: string) => void
  setHideMainWorktrees: (hide: boolean) => void
  setViewMode: (mode: 'card' | 'table') => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setLastScanTime: (time: number) => void
  setShowScanComplete: (show: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  selectedRepo: null,
  stashRepo: null,
  sourceFilter: 'all',
  statusFilter: 'all',
  sortBy: 'lastModified',
  sortDirection: 'desc',
  searchQuery: '',
  hideMainWorktrees: true,
  viewMode: 'card',
  theme: 'dark',
  lastScanTime: null,
  showScanComplete: false,

  setCurrentView: (view) => set({ currentView: view }),
  // Only set currentView to worktrees when selecting a specific repo, not when clearing
  setSelectedRepo: (repo) => set(repo ? { selectedRepo: repo, currentView: 'worktrees' } : { selectedRepo: null }),
  setStashRepo: (repo) => set({ stashRepo: repo, currentView: 'stashes' }),
  setSourceFilter: (source) => set({ sourceFilter: source }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortDirection: () => set((s) => ({ sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc' })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setHideMainWorktrees: (hide) => set({ hideMainWorktrees: hide }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setTheme: (theme) => set({ theme }),
  setLastScanTime: (time) => set({ lastScanTime: time }),
  setShowScanComplete: (show) => set({ showScanComplete: show })
}))
