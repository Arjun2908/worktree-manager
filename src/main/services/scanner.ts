import { access, readdir, stat } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import {
  canonicalizePath,
  countStashes,
  findPRsForBranches,
  getBranchDivergence,
  getDefaultBranch,
  getGitCommonDir,
  getGitHubRepo,
  getSafetyStatus,
  getWorkSummary,
  listWorktrees,
  type SafetyLevel
} from './git'

const DISCOVERY_CONCURRENCY = 16
const REPO_CONCURRENCY = 3
const WORKTREE_CONCURRENCY = 4
const SKIPPED_DISCOVERY_DIRS = new Set(['node_modules', 'vendor', 'out', 'dist', 'release'])

export interface ScannedWorktree {
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

export interface ScanResult {
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

export interface KnownWorktree {
  path: string
  repoPath: string
  source: ScannedWorktree['source']
  isMainWorktree: boolean
  statuses: string[]
}

interface DiscoveredRepo {
  path: string
  commonDir: string
}

interface ScanProgress {
  current: number
  total: number
  repo: string
}

interface InFlightScan {
  promise: Promise<ScanResult>
  listeners: Set<(progress: ScanProgress) => void>
  lastProgress: ScanProgress | null
}

const inFlightScans = new Map<string, InFlightScan>()
let knownWorktrees = new Map<string, KnownWorktree>()
let nextScanGeneration = 1
let latestPublishedGeneration = 0

function makeId(path: string): string {
  return createHash('md5').update(path).digest('hex').slice(0, 12)
}

function worktreeKey(path: string): string {
  return resolve(path)
}

export function getKnownWorktree(path: string, repoPath: string): KnownWorktree | null {
  const known = knownWorktrees.get(worktreeKey(path))
  if (!known || resolve(known.repoPath) !== resolve(repoPath)) return null
  return { ...known, statuses: [...known.statuses] }
}

export function forgetKnownWorktree(path: string): void {
  knownWorktrees.delete(worktreeKey(path))
}

/**
 * Put a mutation barrier ahead of all currently running scans. Their callers
 * may still receive a result, but an older snapshot cannot repopulate the
 * deletion catalog and subsequent scans will not coalesce with stale work.
 */
export function invalidateScanState(): void {
  latestPublishedGeneration = nextScanGeneration++
  inFlightScans.clear()
}

function publishKnownWorktrees(result: ScanResult): void {
  const next = new Map<string, KnownWorktree>()
  for (const repo of result.repos) {
    for (const worktree of repo.worktrees) {
      next.set(worktreeKey(worktree.path), {
        path: worktree.path,
        repoPath: worktree.repoPath,
        source: worktree.source,
        isMainWorktree: worktree.isMainWorktree,
        statuses: [...worktree.statuses]
      })
    }
  }
  knownWorktrees = next
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        results[index] = await mapper(items[index], index)
      }
    }
  )
  await Promise.all(workers)
  return results
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function getLastModified(dirPath: string): Promise<string | null> {
  try {
    const result = await stat(dirPath)
    return result.mtime.toISOString()
  } catch {
    return null
  }
}

async function getCanonicalMainPath(candidatePath: string, commonDir: string): Promise<string> {
  if (basename(commonDir) === '.git') {
    return canonicalizePath(dirname(commonDir))
  }

  const worktrees = await listWorktrees(candidatePath)
  return worktrees[0]?.path
    ? canonicalizePath(worktrees[0].path)
    : canonicalizePath(candidatePath)
}

/**
 * Recursively discover repositories, stopping at repository boundaries. The
 * common Git directory is the identity key, so linked worktrees and overlapping
 * scan roots cannot produce duplicate repository summaries.
 */
export async function findGitRepos(rootDirs: string[]): Promise<DiscoveredRepo[]> {
  let frontier = Array.from(new Set(rootDirs.map((root) => resolve(root))))
  const seenDirs = new Set<string>()
  const reposByCommonDir = new Map<string, DiscoveredRepo>()

  while (frontier.length > 0) {
    const inspections = await mapWithConcurrency(frontier, DISCOVERY_CONCURRENCY, async (dirPath) => {
      const canonicalDir = await canonicalizePath(dirPath)
      if (seenDirs.has(canonicalDir)) return [] as string[]
      seenDirs.add(canonicalDir)

      if (await exists(join(canonicalDir, '.git'))) {
        const commonDir = await getGitCommonDir(canonicalDir)
        if (commonDir && !reposByCommonDir.has(commonDir)) {
          reposByCommonDir.set(commonDir, {
            commonDir,
            path: await getCanonicalMainPath(canonicalDir, commonDir)
          })
        }
        return [] as string[]
      }

      try {
        const entries = await readdir(canonicalDir, { withFileTypes: true })
        return entries
          .filter((entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !SKIPPED_DISCOVERY_DIRS.has(entry.name)
          )
          .map((entry) => join(canonicalDir, entry.name))
      } catch {
        return [] as string[]
      }
    })
    frontier = inspections.flat()
  }

  return Array.from(reposByCommonDir.values()).sort((a, b) => a.path.localeCompare(b.path))
}

const DEFAULT_WT: Pick<ScannedWorktree, 'prInfo' | 'summary' | 'safety' | 'divergence'> = {
  prInfo: null,
  summary: '',
  safety: { level: 'caution', reasons: [] },
  divergence: null
}

async function findToolWorktrees(
  repoPath: string,
  repoName: string,
  commonDir: string,
  ambiguousRepoName: boolean
): Promise<ScannedWorktree[]> {
  const home = homedir()
  const toolDirs: Array<{
    base: string
    source: 'claude' | 'cursor'
    global: boolean
  }> = [
    { base: join(home, '.claude', 'worktrees', repoName), source: 'claude', global: true },
    { base: join(home, '.cursor', 'worktrees', repoName), source: 'cursor', global: true },
    { base: join(repoPath, '.claude', 'worktrees'), source: 'claude', global: false }
  ]

  const discovered = await Promise.all(toolDirs.map(async ({ base, source, global }) => {
    if (!(await exists(base))) return [] as ScannedWorktree[]
    try {
      const entries = await readdir(base, { withFileTypes: true })
      const worktrees = await mapWithConcurrency(entries, 8, async (entry): Promise<ScannedWorktree | null> => {
        if (!entry.isDirectory()) return null
        const wtPath = await canonicalizePath(join(base, entry.name))
        const hasGitMarker = await exists(join(wtPath, '.git'))
        const worktreeCommonDir = hasGitMarker ? await getGitCommonDir(wtPath) : null

        if (worktreeCommonDir && worktreeCommonDir !== commonDir) return null
        if (global && ambiguousRepoName && !worktreeCommonDir) return null

        let contents: string[]
        try {
          contents = await readdir(wtPath)
        } catch {
          return null
        }

        if (contents.length === 0) {
          return {
            id: makeId(wtPath), path: wtPath, repoName, repoPath,
            branch: null, commitHash: '', source, isMainWorktree: false,
            statuses: ['orphan'], diskSize: null,
            lastModified: await getLastModified(wtPath),
            locked: false, prunable: true,
            ...DEFAULT_WT,
            safety: { level: 'safe' as const, reasons: ['empty orphan directory'] }
          }
        }

        return {
          id: makeId(wtPath), path: wtPath, repoName, repoPath,
          branch: entry.name, commitHash: '', source, isMainWorktree: false,
          statuses: [], diskSize: null,
          lastModified: await getLastModified(wtPath),
          locked: false, prunable: false,
          ...DEFAULT_WT,
          safety: {
            level: 'danger' as const,
            reasons: ['not registered with Git; inspect contents before deleting']
          }
        }
      })
      return worktrees.filter((worktree): worktree is ScannedWorktree => worktree !== null)
    } catch {
      return [] as ScannedWorktree[]
    }
  }))

  const unique = new Map<string, ScannedWorktree>()
  for (const worktree of discovered.flat()) unique.set(worktree.path, worktree)
  return Array.from(unique.values())
}

function determineStatuses(worktree: ScannedWorktree, staleThresholdDays: number): string[] {
  const statuses = [...worktree.statuses]
  if (worktree.locked && !statuses.includes('locked')) statuses.push('locked')
  if (worktree.prunable && !statuses.includes('prunable')) statuses.push('prunable')

  if (worktree.lastModified) {
    const daysSince = (Date.now() - new Date(worktree.lastModified).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince > staleThresholdDays) {
      if (!statuses.includes('stale')) statuses.push('stale')
    } else if (!statuses.includes('orphan') && !statuses.includes('prunable')) {
      if (!statuses.includes('active')) statuses.push('active')
    }
  }
  return statuses
}

async function scanRepo(
  discoveredRepo: DiscoveredRepo,
  staleThresholdDays: number,
  ambiguousRepoName: boolean
): Promise<ScanResult['repos'][number] | null> {
  const initialGitWorktrees = await listWorktrees(discoveredRepo.path)
  const gitWorktrees = await Promise.all(initialGitWorktrees.map(async (worktree) => ({
    ...worktree,
    path: await canonicalizePath(worktree.path)
  })))
  const repoPath = gitWorktrees[0]?.path ?? discoveredRepo.path
  const repoName = basename(repoPath)

  const [toolWorktrees, defaultBranch, githubRepo, stashCount] = await Promise.all([
    findToolWorktrees(repoPath, repoName, discoveredRepo.commonDir, ambiguousRepoName),
    getDefaultBranch(repoPath),
    getGitHubRepo(repoPath),
    countStashes(repoPath)
  ])

  const allWorktrees: ScannedWorktree[] = []
  const toolPaths = new Set(toolWorktrees.map((worktree) => worktree.path))
  const toolByPath = new Map(toolWorktrees.map((worktree) => [worktree.path, worktree]))

  for (let index = 0; index < gitWorktrees.length; index++) {
    const gitWorktree = gitWorktrees[index]
    const matchingTool = toolByPath.get(gitWorktree.path)
    if (matchingTool) toolPaths.delete(gitWorktree.path)

    const worktree: ScannedWorktree = {
      id: makeId(gitWorktree.path), path: gitWorktree.path, repoName, repoPath,
      branch: gitWorktree.branch, commitHash: gitWorktree.head?.slice(0, 8) || '',
      source: matchingTool?.source ?? 'git', isMainWorktree: index === 0,
      statuses: gitWorktree.detached ? ['detached'] : [],
      diskSize: null, lastModified: await getLastModified(gitWorktree.path),
      locked: gitWorktree.locked, prunable: gitWorktree.prunable,
      ...DEFAULT_WT
    }
    worktree.statuses = determineStatuses(worktree, staleThresholdDays)
    allWorktrees.push(worktree)
  }

  for (const toolWorktree of toolWorktrees) {
    if (!toolPaths.has(toolWorktree.path)) continue
    toolWorktree.statuses = determineStatuses(toolWorktree, staleThresholdDays)
    if (!toolWorktree.statuses.includes('orphan')) toolWorktree.statuses.push('orphan')
    allWorktrees.push(toolWorktree)
  }

  const nonMainWorktrees = allWorktrees.filter((worktree) => !worktree.isMainWorktree)
  const branchNames = nonMainWorktrees
    .filter((worktree) => worktree.branch && !worktree.statuses.includes('orphan'))
    .map((worktree) => worktree.branch!)

  const enrichmentPromise = mapWithConcurrency(
    nonMainWorktrees,
    WORKTREE_CONCURRENCY,
    async (worktree) => {
      if (worktree.statuses.includes('orphan')) return
      const [summary, safety, divergence] = await Promise.all([
        getWorkSummary(repoPath, worktree.path, worktree.branch, defaultBranch),
        getSafetyStatus(repoPath, worktree.path, worktree.branch, defaultBranch),
        worktree.branch
          ? getBranchDivergence(repoPath, worktree.branch, defaultBranch)
          : Promise.resolve(null)
      ])
      worktree.summary = summary
      worktree.safety = safety
      worktree.divergence = divergence
    }
  )
  const prsPromise: Promise<Record<string, NonNullable<ScannedWorktree['prInfo']>>> = githubRepo && branchNames.length > 0
    ? findPRsForBranches(repoPath, branchNames)
    : Promise.resolve({})

  const [, prMap] = await Promise.all([enrichmentPromise, prsPromise])
  for (const worktree of allWorktrees) {
    if (worktree.branch && prMap[worktree.branch]) worktree.prInfo = prMap[worktree.branch]
  }

  if (allWorktrees.length === 0) return null
  const totalDiskSize = allWorktrees.reduce((sum, worktree) => sum + (worktree.diskSize ?? 0), 0)
  return {
    name: repoName,
    path: repoPath,
    worktreeCount: allWorktrees.length,
    totalDiskSize,
    stashCount,
    worktrees: allWorktrees
  }
}

async function performScan(
  rootDirs: string[],
  emitProgress: (progress: ScanProgress) => void,
  staleThresholdDays: number,
  generation: number
): Promise<ScanResult> {
  const start = Date.now()
  const discoveredRepos = await findGitRepos(rootDirs)
  const repoNameCounts = new Map<string, number>()
  for (const repo of discoveredRepos) {
    const name = basename(repo.path)
    repoNameCounts.set(name, (repoNameCounts.get(name) ?? 0) + 1)
  }

  let completed = 0
  emitProgress({ current: 0, total: discoveredRepos.length, repo: '' })
  const summaries = await mapWithConcurrency(
    discoveredRepos,
    REPO_CONCURRENCY,
    async (repo) => {
      const summary = await scanRepo(
        repo,
        staleThresholdDays,
        (repoNameCounts.get(basename(repo.path)) ?? 0) > 1
      )
      emitProgress({
        current: ++completed,
        total: discoveredRepos.length,
        repo: basename(repo.path)
      })
      return summary
    }
  )
  const repos = summaries
    .filter((summary): summary is ScanResult['repos'][number] => summary !== null)
    .sort((a, b) => b.worktreeCount - a.worktreeCount || a.name.localeCompare(b.name))

  const result: ScanResult = {
    repos,
    totalWorktrees: repos.reduce((sum, repo) => sum + repo.worktreeCount, 0),
    totalDiskUsage: repos.reduce((sum, repo) => sum + repo.totalDiskSize, 0),
    totalStashes: repos.reduce((sum, repo) => sum + repo.stashCount, 0),
    scanDuration: Date.now() - start
  }
  if (generation >= latestPublishedGeneration) {
    publishKnownWorktrees(result)
    latestPublishedGeneration = generation
  }
  return result
}

function scanKey(rootDirs: string[], staleThresholdDays: number): string {
  return JSON.stringify({
    roots: Array.from(new Set(rootDirs.map((root) => resolve(root)))).sort(),
    staleThresholdDays
  })
}

export function scanWorktrees(
  rootDirs: string[],
  onProgress?: (progress: ScanProgress) => void,
  staleThresholdDays: number = 30
): Promise<ScanResult> {
  const normalizedRoots = Array.from(new Set(rootDirs.map((root) => resolve(root)))).sort()
  const key = scanKey(normalizedRoots, staleThresholdDays)
  const existing = inFlightScans.get(key)
  if (existing) {
    if (onProgress) {
      existing.listeners.add(onProgress)
      if (existing.lastProgress) onProgress(existing.lastProgress)
    }
    return existing.promise
  }

  const listeners = new Set<(progress: ScanProgress) => void>()
  if (onProgress) listeners.add(onProgress)
  const entry: InFlightScan = {
    listeners,
    lastProgress: null,
    promise: Promise.resolve(null as unknown as ScanResult)
  }
  const emitProgress = (progress: ScanProgress) => {
    entry.lastProgress = progress
    for (const listener of Array.from(entry.listeners)) {
      try {
        listener(progress)
      } catch {
        // A destroyed renderer must not abort shared scan work.
      }
    }
  }

  const generation = nextScanGeneration++
  entry.promise = performScan(normalizedRoots, emitProgress, staleThresholdDays, generation)
  inFlightScans.set(key, entry)
  entry.promise.then(
    () => {
      if (inFlightScans.get(key) === entry) inFlightScans.delete(key)
    },
    () => {
      if (inFlightScans.get(key) === entry) inFlightScans.delete(key)
    }
  )
  return entry.promise
}
