import { ipcMain, dialog, BrowserWindow } from 'electron'
import { scanWorktrees } from './services/scanner'
import { removeWorktree, pruneWorktrees, lockWorktree, unlockWorktree, listStashes, dropStash, dropStashesBefore } from './services/git'
import { getDiskUsageBatch } from './services/disk'
import { openInFinder, openInTerminal, openInEditor } from './services/opener'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const SETTINGS_DIR = join(homedir(), '.config', 'worktree-manager')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

const DEFAULT_SETTINGS = {
  scanRoots: [join(homedir(), 'source')],
  theme: 'dark' as const,
  showMainWorktrees: false,
  defaultView: 'card' as const,
  staleThresholdDays: 30
}

function loadSettings() {
  try {
    if (existsSync(SETTINGS_FILE)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) }
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettingsToFile(settings: typeof DEFAULT_SETTINGS) {
  mkdirSync(SETTINGS_DIR, { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

export function registerIpcHandlers() {
  ipcMain.handle('scan-worktrees', async (event, rootDirs: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const settings = loadSettings()
    return scanWorktrees(rootDirs, (progress) => {
      win?.webContents.send('scan-progress', progress)
    }, settings.staleThresholdDays)
  })

  ipcMain.handle('delete-worktree', async (_, worktreePath: string, repoPath: string, force: boolean) => {
    // First try git worktree remove
    const result = await removeWorktree(repoPath, worktreePath, force)
    if (!result.success && force) {
      // If git remove failed even with force, try rm -rf for orphaned dirs
      try {
        await execFileAsync('rm', ['-rf', worktreePath])
        await pruneWorktrees(repoPath)
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
    return result
  })

  ipcMain.handle('prune-worktrees', async (_, repoPath: string) => {
    const pruned = await pruneWorktrees(repoPath)
    return { pruned }
  })

  ipcMain.handle('lock-worktree', async (_, worktreePath: string, repoPath: string) => {
    await lockWorktree(repoPath, worktreePath)
  })

  ipcMain.handle('unlock-worktree', async (_, worktreePath: string, repoPath: string) => {
    await unlockWorktree(repoPath, worktreePath)
  })

  ipcMain.handle('get-disk-usage', async (_, paths: string[]) => {
    return getDiskUsageBatch(paths)
  })

  ipcMain.handle('open-in-finder', async (_, path: string) => {
    openInFinder(path)
  })

  ipcMain.handle('open-in-terminal', async (_, path: string) => {
    await openInTerminal(path)
  })

  ipcMain.handle('open-in-editor', async (_, path: string, editor: 'code' | 'cursor') => {
    await openInEditor(path, editor)
  })

  ipcMain.handle('get-settings', async () => {
    return loadSettings()
  })

  ipcMain.handle('save-settings', async (_, settings) => {
    saveSettingsToFile(settings)
  })

  ipcMain.handle('open-url', async (_, url: string) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  })

  ipcMain.handle('list-stashes', async (_, repoPath: string) => {
    return listStashes(repoPath)
  })

  ipcMain.handle('drop-stash', async (_, repoPath: string, index: number) => {
    await dropStash(repoPath, index)
  })

  ipcMain.handle('drop-stashes-before', async (_, repoPath: string, beforeDate: string) => {
    return dropStashesBefore(repoPath, beforeDate)
  })

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
}
