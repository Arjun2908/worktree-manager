import { contextBridge, ipcRenderer } from 'electron'

interface UpdateStatus {
  phase: 'unavailable' | 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'
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

interface DeleteWorktreesRequest {
  items: Array<{ path: string; repoPath: string; force: boolean }>
}

interface DeleteWorktreesResponse {
  results: Array<{
    path: string
    repoPath: string
    success: boolean
    error?: string
  }>
}

interface DropStashesBeforeResponse {
  results: Array<{
    oid: string
    success: boolean
    error?: string
  }>
}

const api = {
  reportRendererReady: (): Promise<void> => ipcRenderer.invoke('renderer:ready'),
  scanWorktrees: (rootDirs: string[], staleThresholdDays: number, requestId: string) =>
    ipcRenderer.invoke('scan-worktrees', rootDirs, staleThresholdDays, requestId),
  deleteWorktree: (path: string, repoPath: string, force: boolean) =>
    ipcRenderer.invoke('delete-worktree', path, repoPath, force),
  deleteWorktrees: (request: DeleteWorktreesRequest): Promise<DeleteWorktreesResponse> =>
    ipcRenderer.invoke('delete-worktrees', request),
  pruneWorktrees: (repoPath: string) => ipcRenderer.invoke('prune-worktrees', repoPath),
  lockWorktree: (path: string, repoPath: string) =>
    ipcRenderer.invoke('lock-worktree', path, repoPath),
  unlockWorktree: (path: string, repoPath: string) =>
    ipcRenderer.invoke('unlock-worktree', path, repoPath),
  getDiskUsage: (paths: string[]) => ipcRenderer.invoke('get-disk-usage', paths),
  openInFinder: (path: string) => ipcRenderer.invoke('open-in-finder', path),
  openInTerminal: (path: string) => ipcRenderer.invoke('open-in-terminal', path),
  openInEditor: (path: string, editor: 'code' | 'cursor') =>
    ipcRenderer.invoke('open-in-editor', path, editor),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  listStashes: (repoPath: string) => ipcRenderer.invoke('list-stashes', repoPath),
  dropStash: (repoPath: string, oid: string) => ipcRenderer.invoke('drop-stash', repoPath, oid),
  dropStashesBefore: (
    repoPath: string,
    beforeDate: string
  ): Promise<DropStashesBeforeResponse> =>
    ipcRenderer.invoke('drop-stashes-before', repoPath, beforeDate),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:get-status'),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const handler = (_: unknown, nextStatus: UpdateStatus) => callback(nextStatus)
    ipcRenderer.on('update:status', handler)
    return () => {
      ipcRenderer.removeListener('update:status', handler)
    }
  },
  onScanProgress: (callback: (progress: { requestId: string; current: number; total: number; repo: string }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('scan-progress', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
