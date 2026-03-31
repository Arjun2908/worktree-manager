import { contextBridge, ipcRenderer } from 'electron'

const api = {
  scanWorktrees: (rootDirs: string[]) => ipcRenderer.invoke('scan-worktrees', rootDirs),
  deleteWorktree: (path: string, repoPath: string, force: boolean) =>
    ipcRenderer.invoke('delete-worktree', path, repoPath, force),
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
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  listStashes: (repoPath: string) => ipcRenderer.invoke('list-stashes', repoPath),
  dropStash: (repoPath: string, index: number) => ipcRenderer.invoke('drop-stash', repoPath, index),
  dropStashesBefore: (repoPath: string, beforeDate: string) => ipcRenderer.invoke('drop-stashes-before', repoPath, beforeDate),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  onScanProgress: (callback: (progress: { current: number; total: number; repo: string }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('scan-progress', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
