import { readdir, stat, access } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import {
  listWorktrees, findPRsForBranches, getWorkSummary, getSafetyStatus,
  getBranchDivergence, countStashes, type SafetyLevel
} from './git'
import { getDiskUsageBatch } from './disk'

interface ScannedWorktree {
  id: string
  path: string
  repoName: string
  repoPath: string
  branch: string | null
  commitHash: string
  source: 'git' | 'claude' | 'cursor'
  isMainWorktree: boolean
  statuses: string[]
  diskSize: number | null
  lastModified: string | null
  locked: boolean
  prunable: boolean
  prInfo: { number: number; url: string; title: string; state: string } | null
  summary: string
  safety: { level: SafetyLevel; reasons: string[] }
  divergence: { ahead: number; behind: number } | null
}

interface ScanResult {
  repos: {
    name: string
    path: string
    worktreeCount: number
    totalDiskSize: number
    stashCount: number
    worktrees: ScannedWorktree[]
  }[]
  totalWorktrees: number
  totalDiskUsage: number
  totalStashes: number
  scanDuration: number
}

function makeId(path: string): string {
  return createHash('md5').update(path).digest('hex').slice(0, 12)
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function isGitRepo(dirPath: string): Promise<boolean> {
  return (await exists(join(dirPath, '.git')))
}

async function getLastModified(dirPath: string): Promise<string | null> {
  try {
    const s = await stat(dirPath)
    return s.mtime.toISOString()
  } catch {
    return null
  }
}

async function findGitRepos(rootDirs: string[]): Promise<string[]> {
  const repos: string[] = []

  for (const rootDir of rootDirs) {
    try {
      const entries = await readdir(rootDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const fullPath = join(rootDir, entry.name)
        if (await isGitRepo(fullPath)) {
          repos.push(fullPath)
        }
        try {
          const subEntries = await readdir(fullPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (!sub.isDirectory() || sub.name.startsWith('.')) continue
            const subPath = join(fullPath, sub.name)
            if (await isGitRepo(subPath)) {
              repos.push(subPath)
            }
          }
        } catch { /* not readable */ }
      }
    } catch { /* root dir doesn't exist */ }
  }

  return repos
}

const DEFAULT_WT: Pick<ScannedWorktree, 'prInfo' | 'summary' | 'safety' | 'divergence'> = {
  prInfo: null,
  summary: '',
  safety: { level: 'caution', reasons: [] },
  divergence: null
}

async function findToolWorktrees(
  repoPath: string,
  repoName: string
): Promise<ScannedWorktree[]> {
  const worktrees: ScannedWorktree[] = []
  const home = homedir()

  const toolDirs: Array<{ base: string; source: 'claude' | 'cursor' }> = [
    { base: join(home, '.claude', 'worktrees', repoName), source: 'claude' },
    { base: join(home, '.cursor', 'worktrees', repoName), source: 'cursor' },
    { base: join(repoPath, '.claude', 'worktrees'), source: 'claude' },
  ]

  for (const { base, source } of toolDirs) {
    if (!(await exists(base))) continue
    try {
      const entries = await readdir(base, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const wtPath = join(base, entry.name)
        try {
          const contents = await readdir(wtPath)
          if (contents.length === 0) {
            worktrees.push({
              id: makeId(wtPath), path: wtPath, repoName, repoPath,
              branch: null, commitHash: '', source, isMainWorktree: false,
              statuses: ['orphan'], diskSize: null,
              lastModified: await getLastModified(wtPath),
              locked: false, prunable: true,
              ...DEFAULT_WT,
              safety: { level: 'safe', reasons: ['empty orphan directory'] }
            })
            continue
          }
        } catch { continue }

        worktrees.push({
          id: makeId(wtPath), path: wtPath, repoName, repoPath,
          branch: entry.name, commitHash: '', source, isMainWorktree: false,
          statuses: [], diskSize: null,
          lastModified: await getLastModified(wtPath),
          locked: false, prunable: false,
          ...DEFAULT_WT
        })
      }
    } catch { /* not readable */ }
  }

  return worktrees
}

function determineStatuses(wt: ScannedWorktree, staleThresholdDays: number): string[] {
  const statuses: string[] = [...wt.statuses]
  if (wt.locked && !statuses.includes('locked')) statuses.push('locked')
  if (wt.prunable && !statuses.includes('prunable')) statuses.push('prunable')

  if (wt.lastModified) {
    const daysSince = (Date.now() - new Date(wt.lastModified).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince > staleThresholdDays) {
      if (!statuses.includes('stale')) statuses.push('stale')
    } else if (!statuses.includes('orphan') && !statuses.includes('prunable')) {
      if (!statuses.includes('active')) statuses.push('active')
    }
  }
  return statuses
}

export async function scanWorktrees(
  rootDirs: string[],
  onProgress?: (progress: { current: number; total: number; repo: string }) => void,
  staleThresholdDays: number = 30
): Promise<ScanResult> {
  const start = Date.now()
  const repos = await findGitRepos(rootDirs)

  const repoSummaries: ScanResult['repos'] = []
  let totalWorktrees = 0
  let totalDiskUsage = 0
  let totalStashes = 0

  for (let i = 0; i < repos.length; i++) {
    const repoPath = repos[i]
    const repoName = basename(repoPath)
    onProgress?.({ current: i + 1, total: repos.length, repo: repoName })

    const gitWorktrees = await listWorktrees(repoPath)
    const toolWorktrees = await findToolWorktrees(repoPath, repoName)

    const allWorktrees: ScannedWorktree[] = []
    const toolPaths = new Set(toolWorktrees.map((tw) => tw.path))

    // Add git worktrees
    for (let j = 0; j < gitWorktrees.length; j++) {
      const gw = gitWorktrees[j]
      const isMain = j === 0

      let source: 'git' | 'claude' | 'cursor' = 'git'
      const matchingTool = toolWorktrees.find((tw) => tw.path === gw.path)
      if (matchingTool) {
        source = matchingTool.source
        toolPaths.delete(gw.path)
      }

      const lastMod = await getLastModified(gw.path)
      const wt: ScannedWorktree = {
        id: makeId(gw.path), path: gw.path, repoName, repoPath,
        branch: gw.branch, commitHash: gw.head?.slice(0, 8) || '',
        source, isMainWorktree: isMain,
        statuses: gw.detached ? ['detached'] : [],
        diskSize: null, lastModified: lastMod,
        locked: gw.locked, prunable: gw.prunable,
        ...DEFAULT_WT
      }
      wt.statuses = determineStatuses(wt, staleThresholdDays)
      allWorktrees.push(wt)
    }

    // Add remaining tool worktrees not tracked by git
    for (const tw of toolWorktrees) {
      if (!toolPaths.has(tw.path)) continue
      tw.statuses = determineStatuses(tw, staleThresholdDays)
      if (!tw.statuses.includes('orphan')) tw.statuses.push('orphan')
      allWorktrees.push(tw)
    }

    // Disk usage for non-main worktrees
    const nonMainWTs = allWorktrees.filter((w) => !w.isMainWorktree)
    if (nonMainWTs.length > 0) {
      const sizes = await getDiskUsageBatch(nonMainWTs.map((w) => w.path))
      for (const wt of allWorktrees) {
        if (sizes[wt.path] !== undefined) wt.diskSize = sizes[wt.path]
      }
    }

    // ─── Enrich non-main worktrees with summary, safety, divergence, PRs ───
    // Run in parallel batches of 5 for performance
    const enrichTargets = nonMainWTs
    for (let b = 0; b < enrichTargets.length; b += 5) {
      const batch = enrichTargets.slice(b, b + 5)
      await Promise.all(batch.map(async (wt) => {
        const [summary, safety, divergence] = await Promise.all([
          getWorkSummary(repoPath, wt.path, wt.branch),
          wt.statuses.includes('orphan') && !wt.branch
            ? Promise.resolve(wt.safety) // Keep existing for empty orphans
            : getSafetyStatus(repoPath, wt.path, wt.branch),
          wt.branch ? getBranchDivergence(repoPath, wt.branch) : Promise.resolve(null)
        ])
        wt.summary = summary
        wt.safety = safety
        wt.divergence = divergence
      }))
    }

    // Fetch PR info
    const branchNames = nonMainWTs.filter((w) => w.branch).map((w) => w.branch!)
    if (branchNames.length > 0) {
      try {
        const prMap = await findPRsForBranches(repoPath, branchNames)
        for (const wt of allWorktrees) {
          if (wt.branch && prMap[wt.branch]) wt.prInfo = prMap[wt.branch]
        }
      } catch { /* gh not available */ }
    }

    // Count stashes
    const stashCount = await countStashes(repoPath)
    totalStashes += stashCount

    const repoTotal = allWorktrees.reduce((sum, w) => sum + (w.diskSize || 0), 0)
    totalWorktrees += allWorktrees.length
    totalDiskUsage += repoTotal

    if (allWorktrees.length > 0) {
      repoSummaries.push({
        name: repoName, path: repoPath,
        worktreeCount: allWorktrees.length, totalDiskSize: repoTotal,
        stashCount, worktrees: allWorktrees
      })
    }
  }

  repoSummaries.sort((a, b) => b.worktreeCount - a.worktreeCount)

  return { repos: repoSummaries, totalWorktrees, totalDiskUsage, totalStashes, scanDuration: Date.now() - start }
}
