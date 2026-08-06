import { app, ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
  forgetKnownWorktree, getKnownWorktree, invalidateScanState, scanWorktrees
} from './services/scanner'
import {
  canonicalizePath, removeWorktree, pruneWorktrees, lockWorktree, unlockWorktree,
  listStashes, dropStash, dropStashesBefore, listWorktrees
} from './services/git'
import { getDiskUsageBatch, invalidateDiskUsage } from './services/disk'
import { loadSettings, saveSettings } from './services/settings'
import {
  checkForAppUpdates,
  downloadAppUpdate,
  getUpdateStatus,
  installAppUpdate
} from './services/updater'
import { openInFinder, openInTerminal, openInEditor } from './services/opener'
import { readdir, rm } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { homedir } from 'os'
import { isTrustedRendererUrl } from './renderer-security'

const DELETE_REPO_CONCURRENCY = 3

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) throw new Error('IPC request did not come from a renderer frame')

  if (!isTrustedRendererUrl(senderUrl, {
    isPackaged: app.isPackaged,
    developmentUrl: process.env.ELECTRON_RENDERER_URL,
    packagedRendererDirectory: join(__dirname, '../renderer')
  })) throw new Error('Refusing IPC request from an untrusted renderer')
}

function registerTrustedHandler(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: any[]) => any
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event)
    return listener(event, ...args)
  })
}

interface DeleteWorktreeItem {
  path: string
  repoPath: string
  force: boolean
}

interface DeleteWorktreeResult {
  path: string
  repoPath: string
  success: boolean
  error?: string
}

function isDeleteWorktreeItem(value: unknown): value is DeleteWorktreeItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.path === 'string' && item.path.length > 0 &&
    typeof item.repoPath === 'string' && item.repoPath.length > 0 &&
    typeof item.force === 'boolean'
}

async function removeKnownOrphan(
  path: string,
  repoPath: string,
  force: boolean
): Promise<{ success: boolean; error?: string }> {
  const canonicalPath = await canonicalizePath(path)
  const canonicalRepoPath = await canonicalizePath(repoPath)
  const repoName = basename(canonicalRepoPath)
  const allowedRoots = await Promise.all([
    join(homedir(), '.claude', 'worktrees', repoName),
    join(homedir(), '.cursor', 'worktrees', repoName),
    join(canonicalRepoPath, '.claude', 'worktrees')
  ].map(canonicalizePath))

  // Scanner discovery only accepts direct children of these tool roots. Recheck
  // that containment after resolving symlinks before recursively deleting.
  if (!allowedRoots.some((root) => dirname(canonicalPath) === root)) {
    return { success: false, error: 'Refusing to delete a path outside known tool worktree roots' }
  }

  let contents: string[]
  try {
    contents = await readdir(canonicalPath)
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { success: true }
    return { success: false, error: error?.message || 'Could not inspect orphan directory' }
  }
  if (contents.length > 0 && !force) {
    return { success: false, error: 'This unregistered worktree is not empty; force deletion is required' }
  }

  try {
    await rm(canonicalPath, { recursive: true, force: false })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Could not delete orphan directory' }
  }
}

async function deleteKnownWorktree(item: DeleteWorktreeItem): Promise<DeleteWorktreeResult> {
  const result: DeleteWorktreeResult = {
    path: item.path,
    repoPath: item.repoPath,
    success: false
  }
  const known = getKnownWorktree(item.path, item.repoPath)
  if (!known) {
    result.error = 'Worktree is not in the latest scan; rescan before deleting it'
    return result
  }
  if (known.isMainWorktree) {
    result.error = 'Refusing to delete the main worktree'
    return result
  }

  const canonicalRepoPath = await canonicalizePath(known.repoPath)
  const canonicalPath = await canonicalizePath(known.path)
  const gitWorktrees = await listWorktrees(canonicalRepoPath)
  const canonicalGitWorktrees = await Promise.all(gitWorktrees.map(async (worktree) => ({
    ...worktree,
    path: await canonicalizePath(worktree.path)
  })))

  if (canonicalGitWorktrees[0]?.path === canonicalPath) {
    result.error = 'Refusing to delete the main worktree'
    return result
  }

  const tracked = canonicalGitWorktrees.find((worktree) => worktree.path === canonicalPath)
  const deletion = tracked
    ? await removeWorktree(canonicalRepoPath, canonicalPath, item.force)
    : known.statuses.includes('orphan') && known.source !== 'git'
      ? await removeKnownOrphan(canonicalPath, canonicalRepoPath, item.force)
      : { success: false, error: 'Worktree is no longer registered with Git; rescan before deleting it' }

  result.success = deletion.success
  if (deletion.error) result.error = deletion.error
  if (deletion.success) {
    invalidateDiskUsage(canonicalPath)
    invalidateScanState()
    forgetKnownWorktree(known.path)
  }
  return result
}

async function deleteKnownWorktrees(items: DeleteWorktreeItem[]): Promise<DeleteWorktreeResult[]> {
  const results = new Array<DeleteWorktreeResult>(items.length)
  const groups = new Map<string, Array<{ item: DeleteWorktreeItem; index: number }>>()
  items.forEach((item, index) => {
    const key = resolve(item.repoPath)
    const group = groups.get(key) ?? []
    group.push({ item, index })
    groups.set(key, group)
  })

  const groupedItems = Array.from(groups.values())
  let nextGroup = 0
  const workers = Array.from(
    { length: Math.min(DELETE_REPO_CONCURRENCY, groupedItems.length) },
    async () => {
      while (nextGroup < groupedItems.length) {
        const group = groupedItems[nextGroup++]
        // Git worktree operations share metadata within a repo, so serialize
        // each group while allowing unrelated repositories to progress together.
        for (const { item, index } of group) {
          results[index] = await deleteKnownWorktree(item)
        }
      }
    }
  )
  await Promise.all(workers)
  return results
}

export function registerIpcHandlers(onRendererReady?: () => void) {
  registerTrustedHandler('renderer:ready', () => onRendererReady?.())
  registerTrustedHandler('update:get-status', () => getUpdateStatus())
  registerTrustedHandler('update:check', () => checkForAppUpdates())
  registerTrustedHandler('update:download', () => downloadAppUpdate())
  registerTrustedHandler('update:install', () => installAppUpdate())

  registerTrustedHandler('scan-worktrees', async (
    event,
    rootDirs: string[],
    requestedStaleThresholdDays?: number,
    requestId?: string
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const settings = loadSettings()
    const staleThresholdDays = Number.isFinite(requestedStaleThresholdDays) && requestedStaleThresholdDays! > 0
      ? requestedStaleThresholdDays!
      : settings.staleThresholdDays
    return scanWorktrees(rootDirs, (progress) => {
      win?.webContents.send('scan-progress', {
        ...progress,
        requestId: typeof requestId === 'string' ? requestId : ''
      })
    }, staleThresholdDays)
  })

  registerTrustedHandler('delete-worktree', async (_, worktreePath: string, repoPath: string, force: boolean) => {
    const item = { path: worktreePath, repoPath, force }
    if (!isDeleteWorktreeItem(item)) {
      return { success: false, error: 'Invalid delete request' }
    }
    const result = await deleteKnownWorktree(item)
    return { success: result.success, error: result.error }
  })

  registerTrustedHandler('delete-worktrees', async (_, request: { items?: unknown } | null) => {
    if (!request || !Array.isArray(request.items)) {
      throw new TypeError('delete-worktrees requires an items array')
    }
    const invalidItems = request.items.filter((item) => !isDeleteWorktreeItem(item))
    if (invalidItems.length > 0) {
      throw new TypeError('delete-worktrees received an invalid item')
    }
    return {
      results: await deleteKnownWorktrees(request.items as DeleteWorktreeItem[])
    }
  })

  registerTrustedHandler('prune-worktrees', async (_, repoPath: string) => {
    const pruned = await pruneWorktrees(repoPath)
    return { pruned }
  })

  registerTrustedHandler('lock-worktree', async (_, worktreePath: string, repoPath: string) => {
    await lockWorktree(repoPath, worktreePath)
  })

  registerTrustedHandler('unlock-worktree', async (_, worktreePath: string, repoPath: string) => {
    await unlockWorktree(repoPath, worktreePath)
  })

  registerTrustedHandler('get-disk-usage', async (_, paths: string[]) => {
    return getDiskUsageBatch(paths)
  })

  registerTrustedHandler('open-in-finder', async (_, path: string) => {
    openInFinder(path)
  })

  registerTrustedHandler('open-in-terminal', async (_, path: string) => {
    await openInTerminal(path)
  })

  registerTrustedHandler('open-in-editor', async (_, path: string, editor: 'code' | 'cursor') => {
    await openInEditor(path, editor)
  })

  registerTrustedHandler('get-settings', async () => {
    return loadSettings()
  })

  registerTrustedHandler('save-settings', async (_, settings: unknown) => {
    return saveSettings(settings)
  })

  registerTrustedHandler('open-url', async (_, url: string) => {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new TypeError('Only HTTP and HTTPS links can be opened')
    }
    const { shell } = require('electron')
    await shell.openExternal(parsedUrl.toString())
  })

  registerTrustedHandler('list-stashes', async (_, repoPath: string) => {
    return listStashes(repoPath)
  })

  registerTrustedHandler('drop-stash', async (_, repoPath: string, oid: string) => {
    if (typeof repoPath !== 'string' || !repoPath || typeof oid !== 'string' || !oid) {
      throw new TypeError('drop-stash requires a repoPath and stash OID')
    }
    await dropStash(repoPath, oid)
  })

  registerTrustedHandler('drop-stashes-before', async (_, repoPath: string, beforeDate: string) => {
    if (typeof repoPath !== 'string' || !repoPath || typeof beforeDate !== 'string' || !beforeDate) {
      throw new TypeError('drop-stashes-before requires a repoPath and cutoff date')
    }
    return { results: await dropStashesBefore(repoPath, beforeDate) }
  })

  registerTrustedHandler('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
}
