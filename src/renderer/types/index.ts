export type WorktreeSource = 'git' | 'claude' | 'cursor'

export type WorktreeStatus = 'active' | 'stale' | 'locked' | 'prunable' | 'detached' | 'orphan'

export type SafetyLevel = 'safe' | 'caution' | 'danger'

export interface Worktree {
  id: string
  path: string
  repoName: string
  repoPath: string
  branch: string | null
  commitHash: string
  source: WorktreeSource
  isMainWorktree: boolean
  statuses: WorktreeStatus[]
  diskSize: number | null
  lastModified: string | null
  locked: boolean
  prunable: boolean
  prInfo: { number: number; url: string; title: string; state: string } | null
  summary: string
  safety: { level: SafetyLevel; reasons: string[] }
  divergence: { ahead: number; behind: number } | null
}

export interface StashEntry {
  index: number
  message: string
  date: string
  branch: string
}

export interface RepoSummary {
  name: string
  path: string
  worktreeCount: number
  totalDiskSize: number
  stashCount: number
  worktrees: Worktree[]
}

export interface ScanResult {
  repos: RepoSummary[]
  totalWorktrees: number
  totalDiskUsage: number
  totalStashes: number
  scanDuration: number
}

export interface AppSettings {
  scanRoots: string[]
  theme: 'dark' | 'light' | 'system'
  showMainWorktrees: boolean
  defaultView: 'card' | 'table'
  staleThresholdDays: number
}

export interface WorktreeAPI {
  scanWorktrees: (rootDirs: string[]) => Promise<ScanResult>
  deleteWorktree: (worktreePath: string, repoPath: string, force: boolean) => Promise<{ success: boolean; error?: string }>
  pruneWorktrees: (repoPath: string) => Promise<{ pruned: string[] }>
  lockWorktree: (worktreePath: string, repoPath: string) => Promise<void>
  unlockWorktree: (worktreePath: string, repoPath: string) => Promise<void>
  getDiskUsage: (paths: string[]) => Promise<Record<string, number>>
  openInFinder: (path: string) => Promise<void>
  openInTerminal: (path: string) => Promise<void>
  openInEditor: (path: string, editor: 'code' | 'cursor') => Promise<void>
  openUrl: (url: string) => Promise<void>
  listStashes: (repoPath: string) => Promise<StashEntry[]>
  dropStash: (repoPath: string, index: number) => Promise<void>
  dropStashesBefore: (repoPath: string, beforeDate: string) => Promise<number>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>
  selectDirectory: () => Promise<string | null>
  onScanProgress: (callback: (progress: { current: number; total: number; repo: string }) => void) => () => void
}

declare global {
  interface Window {
    api: WorktreeAPI
  }
}
