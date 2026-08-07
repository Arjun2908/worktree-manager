import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  activeBatches: 0,
  maxActiveBatches: 0,
  activeFallbacks: 0,
  maxActiveFallbacks: 0,
  batchSizes: [] as number[],
  failBatches: false
}))

vi.mock('child_process', () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    callback: (
      error: Error | null,
      result?: { stdout: string; stderr: string }
    ) => void
  ) => {
    const paths = args.slice(1)
    const isFallback = paths.length === 1
    if (isFallback) {
      state.activeFallbacks++
      state.maxActiveFallbacks = Math.max(state.maxActiveFallbacks, state.activeFallbacks)
      setTimeout(() => {
        state.activeFallbacks--
        callback(null, { stdout: `1\t${paths[0]}\n`, stderr: '' })
      }, 5)
      return
    }

    state.batchSizes.push(paths.length)
    state.activeBatches++
    state.maxActiveBatches = Math.max(state.maxActiveBatches, state.activeBatches)
    setTimeout(() => {
      state.activeBatches--
      if (state.failBatches) {
        const error = Object.assign(new Error('batch timed out'), { stdout: '' })
        callback(error)
      } else {
        callback(null, { stdout: paths.map((path) => `1\t${path}`).join('\n'), stderr: '' })
      }
    }, 5)
  }
}))

import { clearDiskUsageCache, getDiskUsageBatch } from './disk'

beforeEach(() => {
  clearDiskUsageCache()
  state.activeBatches = 0
  state.maxActiveBatches = 0
  state.activeFallbacks = 0
  state.maxActiveFallbacks = 0
  state.batchSizes = []
  state.failBatches = false
})

describe('disk usage scheduling', () => {
  it('keeps batches small and bounds batch concurrency', async () => {
    const paths = Array.from({ length: 10 }, (_, index) => `/tmp/worktree-${index}`)
    await getDiskUsageBatch(paths)

    expect(state.batchSizes).toEqual([4, 4, 2])
    expect(state.maxActiveBatches).toBeLessThanOrEqual(2)
  })

  it('bounds per-path fallback concurrency across failed batches', async () => {
    state.failBatches = true
    const paths = Array.from({ length: 8 }, (_, index) => `/tmp/fallback-${index}`)
    const sizes = await getDiskUsageBatch(paths)

    expect(state.maxActiveFallbacks).toBeLessThanOrEqual(2)
    expect(Object.values(sizes)).toEqual(Array(8).fill(1024))
  })
})
