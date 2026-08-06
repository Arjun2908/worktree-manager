export type WorktreeSource = 'git' | 'claude' | 'cursor'

export type WorktreeStatus = 'active' | 'stale' | 'locked' | 'prunable' | 'detached' | 'orphan'

export type SafetyLevel = 'safe' | 'caution' | 'danger'
export type WorktreeView = 'board' | 'table'

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
  oid: string
  index: number
  message: string
  date: string
  branch: string
}

export interface StashDropResult {
  oid: string
  success: boolean
  error?: string
}

export interface DropStashesBeforeResponse {
  results: StashDropResult[]
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

export interface ScanProgress {
  requestId: string
  current: number
  total: number
  repo: string
}

export type UpdatePhase =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  releaseName?: string
  progress?: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }
  message?: string
  checkedAt?: string
}

export interface AppSettings {
  settingsVersion: 2
  scanRoots: string[]
  theme: 'dark' | 'light' | 'system'
  showMainWorktrees: boolean
  defaultView: WorktreeView
  staleThresholdDays: number
}

export interface DeleteWorktreeInput {
  path: string
  repoPath: string
  force: boolean
}

export interface DeleteWorktreeResult {
  path: string
  repoPath: string
  success: boolean
  error?: string
}

export interface DeleteWorktreesRequest {
  items: DeleteWorktreeInput[]
}

export interface DeleteWorktreesResponse {
  results: DeleteWorktreeResult[]
}

export interface DeleteWorktreesOutcome extends DeleteWorktreesResponse {
  successful: DeleteWorktreeResult[]
  failures: DeleteWorktreeResult[]
}

export interface WorktreeAPI {
  reportRendererReady: () => Promise<void>
  scanWorktrees: (rootDirs: string[], staleThresholdDays: number, requestId: string) => Promise<ScanResult>
  deleteWorktree: (worktreePath: string, repoPath: string, force: boolean) => Promise<{ success: boolean; error?: string }>
  deleteWorktrees: (request: DeleteWorktreesRequest) => Promise<DeleteWorktreesResponse>
  pruneWorktrees: (repoPath: string) => Promise<{ pruned: string[] }>
  lockWorktree: (worktreePath: string, repoPath: string) => Promise<void>
  unlockWorktree: (worktreePath: string, repoPath: string) => Promise<void>
  getDiskUsage: (paths: string[]) => Promise<Record<string, number>>
  openInFinder: (path: string) => Promise<void>
  openInTerminal: (path: string) => Promise<void>
  openInEditor: (path: string, editor: 'code' | 'cursor') => Promise<void>
  openUrl: (url: string) => Promise<void>
  listStashes: (repoPath: string) => Promise<StashEntry[]>
  dropStash: (repoPath: string, oid: string) => Promise<void>
  dropStashesBefore: (repoPath: string, beforeDate: string) => Promise<DropStashesBeforeResponse>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<void>
  selectDirectory: () => Promise<string | null>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
}

declare global {
  interface Window {
    api: WorktreeAPI
  }
}
