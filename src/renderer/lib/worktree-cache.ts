import type { ScanResult, StashEntry } from '../types'

function sumDiskUsage(worktrees: ScanResult['repos'][number]['worktrees']): number {
  return worktrees.reduce((total, worktree) => total + (worktree.diskSize ?? 0), 0)
}

/**
 * Hydrates disk sizes independently from repository discovery so a slow disk
 * walk cannot hold the primary scan result hostage.
 */
export function hydrateWorktreeDiskUsage(
  scanResult: ScanResult,
  sizesByPath: Readonly<Record<string, number>>
): ScanResult {
  let changed = false
  const repos = scanResult.repos.map((repo) => {
    let repoChanged = false
    const worktrees = repo.worktrees.map((worktree) => {
      const diskSize = sizesByPath[worktree.path]
      if (diskSize === undefined || worktree.diskSize === diskSize) return worktree

      repoChanged = true
      changed = true
      return { ...worktree, diskSize }
    })

    if (!repoChanged) return repo
    return {
      ...repo,
      worktrees,
      totalDiskSize: sumDiskUsage(worktrees)
    }
  })

  if (!changed) return scanResult
  return {
    ...scanResult,
    repos,
    totalDiskUsage: repos.reduce((total, repo) => total + repo.totalDiskSize, 0)
  }
}

/** Returns only missing, non-main paths that are not already being measured. */
export function getUnhydratedDiskUsagePaths(
  scanResult: ScanResult,
  inFlightPaths: ReadonlySet<string>
): string[] {
  const paths = new Set<string>()
  for (const repo of scanResult.repos) {
    for (const worktree of repo.worktrees) {
      if (worktree.isMainWorktree || worktree.diskSize !== null || inFlightPaths.has(worktree.path)) {
        continue
      }
      paths.add(worktree.path)
    }
  }
  return Array.from(paths)
}

/**
 * Removes successfully deleted worktrees and keeps every cached aggregate in
 * sync. The original result is retained when none of the paths are present so
 * React Query can preserve referential equality for unaffected caches.
 */
export function removeWorktreesFromScanResult(
  scanResult: ScanResult,
  deletedPaths: Iterable<string>
): ScanResult {
  const paths = deletedPaths instanceof Set ? deletedPaths : new Set(deletedPaths)
  if (paths.size === 0) return scanResult

  let changed = false
  const repos = scanResult.repos.map((repo) => {
    const worktrees = repo.worktrees.filter((worktree) => !paths.has(worktree.path))
    if (worktrees.length === repo.worktrees.length) return repo

    changed = true
    return {
      ...repo,
      worktrees,
      worktreeCount: worktrees.length,
      totalDiskSize: sumDiskUsage(worktrees)
    }
  })

  if (!changed) return scanResult

  return {
    ...scanResult,
    repos,
    totalWorktrees: repos.reduce((total, repo) => total + repo.worktreeCount, 0),
    totalDiskUsage: repos.reduce((total, repo) => total + repo.totalDiskSize, 0)
  }
}

/** Applies a confirmed lock operation immediately while a background scan verifies it. */
export function setWorktreeLockState(
  scanResult: ScanResult,
  path: string,
  locked: boolean
): ScanResult {
  let changed = false
  const repos = scanResult.repos.map((repo) => {
    let repoChanged = false
    const worktrees = repo.worktrees.map((worktree) => {
      if (worktree.path !== path || worktree.locked === locked) return worktree

      repoChanged = true
      changed = true
      return {
        ...worktree,
        locked,
        statuses: locked
          ? worktree.statuses.includes('locked')
            ? worktree.statuses
            : [...worktree.statuses, 'locked' as const]
          : worktree.statuses.filter((status) => status !== 'locked')
      }
    })
    return repoChanged ? { ...repo, worktrees } : repo
  })

  return changed ? { ...scanResult, repos } : scanResult
}

/** Reconciles a known stash-count delta without requiring a full worktree scan. */
export function applyStashCountDelta(
  scanResult: ScanResult,
  repoPath: string,
  delta: number
): ScanResult {
  if (delta === 0) return scanResult

  let changed = false
  const repos = scanResult.repos.map((repo) => {
    if (repo.path !== repoPath) return repo

    const stashCount = Math.max(0, repo.stashCount + delta)
    if (stashCount === repo.stashCount) return repo

    changed = true
    return { ...repo, stashCount }
  })

  if (!changed) return scanResult

  return {
    ...scanResult,
    repos,
    totalStashes: repos.reduce((total, repo) => total + repo.stashCount, 0)
  }
}

/** Removes confirmed stash OIDs and applies Git's resulting index compaction. */
export function removeStashesByOid(
  stashes: StashEntry[],
  successfulOids: Iterable<string>
): StashEntry[] {
  const oids = successfulOids instanceof Set ? successfulOids : new Set(successfulOids)
  if (oids.size === 0) return stashes

  const remaining = stashes.filter((stash) => !oids.has(stash.oid))
  if (remaining.length === stashes.length) return stashes

  return remaining.map((stash, index) =>
    stash.index === index ? stash : { ...stash, index }
  )
}
