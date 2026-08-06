import { describe, expect, it } from 'vitest'
import {
  applyStashCountDelta,
  getUnhydratedDiskUsagePaths,
  hydrateWorktreeDiskUsage,
  removeStashesByOid,
  removeWorktreesFromScanResult,
  setWorktreeLockState
} from './worktree-cache'
import type { ScanResult, Worktree } from '../types'

function worktree(path: string, diskSize: number): Worktree {
  return {
    id: path,
    path,
    repoName: 'repo',
    repoPath: '/repo',
    branch: 'branch',
    commitHash: '12345678',
    source: 'git',
    isMainWorktree: false,
    statuses: ['active'],
    diskSize,
    lastModified: '2026-08-06T00:00:00.000Z',
    locked: false,
    prunable: false,
    prInfo: null,
    summary: '',
    safety: { level: 'safe', reasons: ['clean'] },
    divergence: { ahead: 0, behind: 0 }
  }
}

function scanResult(): ScanResult {
  return {
    repos: [
      {
        name: 'repo',
        path: '/repo',
        worktreeCount: 2,
        totalDiskSize: 300,
        stashCount: 3,
        worktrees: [worktree('/repo/a', 100), worktree('/repo/b', 200)]
      }
    ],
    totalWorktrees: 2,
    totalDiskUsage: 300,
    totalStashes: 3,
    scanDuration: 10
  }
}

describe('worktree cache reconciliation', () => {
  it('hydrates disk sizes immutably and recomputes repository and global totals', () => {
    const current = scanResult()
    current.repos[0].worktrees[0].diskSize = null
    current.repos[0].worktrees[1].diskSize = null
    current.repos[0].totalDiskSize = 0
    current.totalDiskUsage = 0

    const hydrated = hydrateWorktreeDiskUsage(current, {
      '/repo/a': 125,
      '/repo/b': 275,
      '/deleted': 500
    })

    expect(hydrated).not.toBe(current)
    expect(hydrated.repos[0].worktrees.map((item) => item.diskSize)).toEqual([125, 275])
    expect(hydrated.repos[0].totalDiskSize).toBe(400)
    expect(hydrated.totalDiskUsage).toBe(400)
    expect(current.totalDiskUsage).toBe(0)
  })

  it('preserves cache identity when hydration has no matching changes', () => {
    const current = scanResult()
    expect(hydrateWorktreeDiskUsage(current, { '/missing': 500 })).toBe(current)
    expect(hydrateWorktreeDiskUsage(current, { '/repo/a': 100 })).toBe(current)
  })

  it('does not schedule duplicate disk hydration for paths already in flight', () => {
    const current = scanResult()
    current.repos[0].worktrees[0].diskSize = null
    current.repos[0].worktrees[1].diskSize = null

    expect(getUnhydratedDiskUsagePaths(current, new Set(['/repo/a']))).toEqual(['/repo/b'])

    current.repos[0].worktrees[1].isMainWorktree = true
    expect(getUnhydratedDiskUsagePaths(current, new Set())).toEqual(['/repo/a'])
  })

  it('removes all successful bulk paths and recomputes every aggregate once', () => {
    const updated = removeWorktreesFromScanResult(scanResult(), ['/repo/a', '/repo/missing'])

    expect(updated.repos[0].worktrees.map((item) => item.path)).toEqual(['/repo/b'])
    expect(updated.repos[0].worktreeCount).toBe(1)
    expect(updated.repos[0].totalDiskSize).toBe(200)
    expect(updated.totalWorktrees).toBe(1)
    expect(updated.totalDiskUsage).toBe(200)
  })

  it('preserves identity when no cached worktree matches', () => {
    const current = scanResult()
    expect(removeWorktreesFromScanResult(current, ['/other'])).toBe(current)
  })

  it('keeps stash counts in the dashboard and sidebar cache aligned', () => {
    const updated = applyStashCountDelta(scanResult(), '/repo', -2)
    expect(updated.repos[0].stashCount).toBe(1)
    expect(updated.totalStashes).toBe(1)
  })

  it('updates a confirmed lock without waiting for the verification scan', () => {
    const current = scanResult()
    const locked = setWorktreeLockState(current, '/repo/a', true)

    expect(locked.repos[0].worktrees[0].locked).toBe(true)
    expect(locked.repos[0].worktrees[0].statuses).toContain('locked')

    const unlocked = setWorktreeLockState(locked, '/repo/a', false)
    expect(unlocked.repos[0].worktrees[0].locked).toBe(false)
    expect(unlocked.repos[0].worktrees[0].statuses).not.toContain('locked')
  })

  it('removes only confirmed stash OIDs and compacts the remaining indexes', () => {
    const stashes = [
      { oid: 'new-oid', index: 0, message: 'new', branch: 'main', date: '2026-08-05T00:00:00.000Z' },
      { oid: 'middle-oid', index: 1, message: 'middle', branch: 'main', date: '2026-07-01T00:00:00.000Z' },
      { oid: 'old-oid', index: 2, message: 'old', branch: 'main', date: '2026-01-01T00:00:00.000Z' }
    ]

    expect(removeStashesByOid(stashes, ['middle-oid']).map((stash) => [stash.index, stash.message])).toEqual([
      [0, 'new'],
      [1, 'old']
    ])
  })

  it('keeps failed bulk drops visible', () => {
    const stashes = [
      { oid: 'new-oid', index: 0, message: 'new', branch: 'main', date: '2026-08-05T00:00:00.000Z' },
      { oid: 'failed-oid', index: 1, message: 'failed', branch: 'main', date: '2026-01-01T00:00:00.000Z' },
      { oid: 'dropped-oid', index: 2, message: 'dropped', branch: 'main', date: '2025-12-01T00:00:00.000Z' }
    ]

    const updated = removeStashesByOid(stashes, ['dropped-oid'])
    expect(updated.map((stash) => [stash.index, stash.oid])).toEqual([
      [0, 'new-oid'],
      [1, 'failed-oid']
    ])
  })
})
