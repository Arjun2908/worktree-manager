import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearDiskUsageCache,
  getDiskUsageBatch,
  getDiskUsageCacheSize,
  invalidateDiskUsage
} from './disk'

const tempDirs: string[] = []

beforeEach(() => {
  clearDiskUsageCache()
})

afterEach(async () => {
  clearDiskUsageCache()
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'worktree-manager-disk-'))
  tempDirs.push(path)
  return path
}

describe('disk usage cache', () => {
  it('reuses a measured size until the path is invalidated', async () => {
    const path = await makeTempDir()
    await writeFile(join(path, 'first.bin'), Buffer.alloc(128 * 1024, 1))

    const first = await getDiskUsageBatch([path])
    await writeFile(join(path, 'second.bin'), Buffer.alloc(1024 * 1024, 1))
    const cached = await getDiskUsageBatch([path])

    expect(cached[path]).toBe(first[path])
    expect(getDiskUsageCacheSize()).toBe(1)

    invalidateDiskUsage(path)
    const refreshed = await getDiskUsageBatch([path])
    expect(refreshed[path]).toBeGreaterThan(first[path])
  })

  it('does not retain a deleted path or cache a failed zero measurement', async () => {
    const root = await makeTempDir()
    const path = join(root, 'worktree')
    await mkdir(path)
    await writeFile(join(path, 'data.bin'), Buffer.alloc(128 * 1024, 1))
    await getDiskUsageBatch([path])

    await rm(path, { recursive: true })
    invalidateDiskUsage(path)
    const deleted = await getDiskUsageBatch([path])
    expect(deleted[path]).toBe(0)
    expect(getDiskUsageCacheSize()).toBe(0)

    await mkdir(path)
    await writeFile(join(path, 'replacement.bin'), Buffer.alloc(256 * 1024, 1))
    const recreated = await getDiskUsageBatch([path])
    expect(recreated[path]).toBeGreaterThan(0)
  })

  it('bounds the number of cached worktree sizes', async () => {
    const root = await makeTempDir()
    const paths = await Promise.all(Array.from({ length: 300 }, async (_, index) => {
      const path = join(root, `worktree-${index}`)
      await mkdir(path)
      await writeFile(join(path, 'data'), 'cached\n')
      return path
    }))

    await getDiskUsageBatch(paths)
    expect(getDiskUsageCacheSize()).toBeLessThanOrEqual(256)
  })
})
