import { execFile } from 'child_process'
import { resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const DU_BATCH_SIZE = 4
const DU_CONCURRENCY = 2
const DISK_CACHE_TTL_MS = 5 * 60 * 1000
const DISK_CACHE_MAX_ENTRIES = 256

interface DiskCacheEntry {
  size: number
  expiresAt: number
}

const diskUsageCache = new Map<string, DiskCacheEntry>()
let cacheEpoch = 0

function cacheKey(path: string): string {
  return resolve(path)
}

function getCachedDiskUsage(path: string, now: number): number | null {
  const key = cacheKey(path)
  const cached = diskUsageCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= now) {
    diskUsageCache.delete(key)
    return null
  }

  // Refresh insertion order for bounded LRU eviction without extending the TTL.
  diskUsageCache.delete(key)
  diskUsageCache.set(key, cached)
  return cached.size
}

function cacheDiskUsage(path: string, size: number, now: number): void {
  // A zero here usually means `du` failed or the path disappeared. Avoid
  // turning that transient state into a five-minute cache entry.
  if (size <= 0) return
  const key = cacheKey(path)
  diskUsageCache.delete(key)
  diskUsageCache.set(key, { size, expiresAt: now + DISK_CACHE_TTL_MS })

  while (diskUsageCache.size > DISK_CACHE_MAX_ENTRIES) {
    const oldest = diskUsageCache.keys().next().value as string | undefined
    if (!oldest) break
    diskUsageCache.delete(oldest)
  }
}

/**
 * Remove one worktree's cached size. Advancing the epoch also prevents any
 * `du` batch which started before the deletion from repopulating stale data.
 */
export function invalidateDiskUsage(path: string): void {
  diskUsageCache.delete(cacheKey(path))
  cacheEpoch++
}

export function clearDiskUsageCache(): void {
  diskUsageCache.clear()
  cacheEpoch++
}

export function getDiskUsageCacheSize(): number {
  return diskUsageCache.size
}

function parseDuOutput(stdout: string): Record<string, number> {
  const results: Record<string, number> = {}
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) continue
    results[match[2]] = Number.parseInt(match[1], 10) * 1024
  }
  return results
}

interface DiskUsageChunkResult {
  sizes: Record<string, number>
  missing: string[]
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        results[index] = await mapper(items[index])
      }
    }
  )
  await Promise.all(workers)
  return results
}

async function getDiskUsageChunk(paths: string[]): Promise<DiskUsageChunkResult> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', ...paths], {
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024
    })
    return { sizes: parseDuOutput(stdout), missing: [] }
  } catch (error: any) {
    // `du` can return a non-zero status for one missing path while still
    // reporting the other paths. Preserve that useful partial output.
    const partial = parseDuOutput(typeof error?.stdout === 'string' ? error.stdout : '')
    const missing = paths.filter((path) => partial[path] === undefined)
    return { sizes: partial, missing }
  }
}

export async function getDiskUsage(dirPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', dirPath], { timeout: 15000 })
    const kb = parseInt(stdout.split('\t')[0], 10)
    return kb * 1024 // Convert KB to bytes
  } catch {
    return 0
  }
}

export async function getDiskUsageBatch(paths: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {}
  const now = Date.now()
  const misses = new Map<string, string>()

  for (const path of paths) {
    const cached = getCachedDiskUsage(path, now)
    if (cached !== null) {
      results[path] = cached
    } else {
      misses.set(cacheKey(path), path)
    }
  }

  const pathsToMeasure = Array.from(misses.values())
  const measurementEpoch = cacheEpoch
  const fallbackPaths: string[] = []
  const chunks: string[][] = []
  for (let i = 0; i < pathsToMeasure.length; i += DU_BATCH_SIZE) {
    chunks.push(pathsToMeasure.slice(i, i + DU_BATCH_SIZE))
  }

  let nextChunk = 0
  const workers = Array.from(
    { length: Math.min(DU_CONCURRENCY, chunks.length) },
    async () => {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk++]
        const measured = await getDiskUsageChunk(chunk)
        Object.assign(results, measured.sizes)
        fallbackPaths.push(...measured.missing)
      }
    }
  )
  await Promise.all(workers)

  const fallbackSizes = await mapWithConcurrency(
    fallbackPaths,
    DU_CONCURRENCY,
    async (path) => [path, await getDiskUsage(path)] as const
  )
  for (const [path, size] of fallbackSizes) results[path] = size

  for (const path of pathsToMeasure) {
    const size = results[path] ?? 0
    if (measurementEpoch === cacheEpoch) cacheDiskUsage(path, size, now)
  }

  // Preserve the previous API guarantee that every requested path has a value.
  for (const path of paths) {
    if (results[path] !== undefined) continue
    const measuredPath = misses.get(cacheKey(path))
    results[path] = measuredPath ? results[measuredPath] ?? 0 : 0
  }

  return results
}
