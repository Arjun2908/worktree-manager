import { describe, expect, it } from 'vitest'
import {
  aggregateBoardWorktrees,
  boardLaneIdForWorktree,
  getBoardSafetySummary,
  partitionWorktreesIntoBoardLanes
} from './board'
import type { SafetyLevel, Worktree } from '../types'

function worktree(
  id: string,
  safety: SafetyLevel,
  diskSize: number | null,
  isMainWorktree = false
): Worktree {
  return {
    id,
    path: `/tmp/${id}`,
    repoName: 'repo',
    repoPath: '/tmp/repo',
    branch: isMainWorktree ? 'main' : id,
    commitHash: '12345678',
    source: 'git',
    isMainWorktree,
    statuses: ['active'],
    diskSize,
    lastModified: '2026-08-06T12:00:00.000Z',
    locked: false,
    prunable: false,
    prInfo: null,
    summary: '',
    safety: { level: safety, reasons: [] },
    divergence: null
  }
}

describe('board worktree partitioning', () => {
  it('puts every worktree in exactly one deterministic lane', () => {
    const input = [
      worktree('safe', 'safe', 100),
      worktree('review', 'caution', 200),
      worktree('risk', 'danger', 300),
      worktree('main', 'safe', 400, true)
    ]

    const lanes = partitionWorktreesIntoBoardLanes(input)
    const ids = lanes.flatMap((lane) => lane.worktrees.map((item) => item.id))

    expect(ids).toHaveLength(input.length)
    expect(new Set(ids)).toEqual(new Set(input.map((item) => item.id)))
    expect(boardLaneIdForWorktree(input[0])).toBe('safe')
    expect(boardLaneIdForWorktree(input[1])).toBe('caution')
    expect(boardLaneIdForWorktree(input[2])).toBe('danger')
    expect(boardLaneIdForWorktree(input[3])).toBe('protected')
  })

  it('keeps aggregate sizes unknown until every linked worktree in scope is measured', () => {
    const lanes = partitionWorktreesIntoBoardLanes([
      worktree('safe-a', 'safe', 100),
      worktree('safe-b', 'safe', null),
      worktree('review', 'caution', 200),
      worktree('main', 'safe', 400, true)
    ])

    expect(lanes.map(({ id, count, diskSize }) => ({ id, count, diskSize }))).toEqual([
      { id: 'safe', count: 2, diskSize: null },
      { id: 'caution', count: 1, diskSize: 200 },
      { id: 'danger', count: 0, diskSize: 0 },
      { id: 'protected', count: 1, diskSize: 400 }
    ])

    expect(aggregateBoardWorktrees(lanes.flatMap((lane) => lane.worktrees))).toEqual({
      count: 4,
      diskSize: null,
      safeCount: 2,
      safeDiskSize: null
    })
  })

  it('reports a real zero only when all relevant sizes are known', () => {
    const aggregate = aggregateBoardWorktrees([
      worktree('safe', 'safe', 0),
      worktree('review', 'caution', 0),
      worktree('main', 'safe', null, true)
    ])

    expect(aggregate).toEqual({
      count: 3,
      diskSize: 0,
      safeCount: 1,
      safeDiskSize: 0
    })
  })

  it('omits the protected lane when main checkouts are hidden', () => {
    const lanes = partitionWorktreesIntoBoardLanes([
      worktree('safe', 'safe', 100)
    ])

    expect(lanes.map((lane) => lane.id)).toEqual(['safe', 'caution', 'danger'])
  })

  it('summarizes the reason that actually explains each safety decision', () => {
    const safe = worktree('safe', 'safe', 100)
    safe.safety.reasons = ['not merged', 'clean working tree', 'pushed to origin/safe']
    const caution = worktree('review', 'caution', 100)
    caution.safety.reasons = ['not merged', '2 uncommitted changes', 'pushed to origin/review']
    const danger = worktree('risk', 'danger', 100)
    danger.safety.reasons = ['not merged', 'clean working tree', 'unpushed commits']

    expect(getBoardSafetySummary(safe)).toBe('Clean working tree · Pushed to origin/safe')
    expect(getBoardSafetySummary(caution)).toBe('2 uncommitted changes')
    expect(getBoardSafetySummary(danger)).toBe('Unpushed commits')
  })
})
