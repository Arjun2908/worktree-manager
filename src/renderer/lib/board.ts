import type { SafetyLevel, Worktree } from '../types'

export type BoardLaneId = SafetyLevel | 'protected'

export interface BoardLane {
  id: BoardLaneId
  label: string
  description: string
  worktrees: Worktree[]
  count: number
  diskSize: number | null
}

function sumKnownDiskUsage(worktrees: Worktree[]): number | null {
  if (worktrees.some((worktree) => worktree.diskSize === null)) return null
  return worktrees.reduce((total, worktree) => total + (worktree.diskSize ?? 0), 0)
}

const LANE_DEFINITIONS: ReadonlyArray<Pick<BoardLane, 'id' | 'label' | 'description'>> = [
  {
    id: 'safe',
    label: 'Safe to remove',
    description: 'Clean work that is merged or recoverable from its upstream.'
  },
  {
    id: 'caution',
    label: 'Review before removal',
    description: 'Recoverable work with local changes, or a clean detached checkout.'
  },
  {
    id: 'danger',
    label: 'Local work at risk',
    description: 'Unpushed, unmerged, or unregistered work needs attention first.'
  },
  {
    id: 'protected',
    label: 'Protected checkouts',
    description: 'Main checkouts are visible for context and cannot be removed.'
  }
]

export function boardLaneIdForWorktree(worktree: Worktree): BoardLaneId {
  return worktree.isMainWorktree ? 'protected' : worktree.safety.level
}

function sentenceCase(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

export function getBoardSafetySummary(worktree: Worktree): string {
  if (worktree.isMainWorktree) return 'Main checkout · protected from removal'

  const reasons = worktree.safety.reasons
  if (reasons.length === 0) return 'No additional safety details are available'

  if (worktree.safety.level === 'safe') {
    const clean = reasons.find((reason) => reason.includes('clean working tree'))
    const recoverable = reasons.find((reason) => reason.startsWith('merged into '))
      ?? reasons.find((reason) => reason.startsWith('pushed to '))
    return [clean, recoverable].filter(Boolean).map((reason) => sentenceCase(reason!)).join(' · ')
      || 'Verified recoverable'
  }

  if (worktree.safety.level === 'caution') {
    const localChanges = reasons.find((reason) => reason.includes('uncommitted change'))
    const detached = reasons.find((reason) => reason.startsWith('detached HEAD'))
    return sentenceCase(localChanges ?? detached ?? reasons[0])
  }

  const risk = reasons.find((reason) => reason.includes('unpushed commits'))
    ?? reasons.find((reason) => reason.includes('no upstream'))
    ?? reasons.find((reason) => reason.includes('not registered'))
    ?? reasons.find((reason) => reason.includes('uncommitted change'))
    ?? reasons[0]
  return sentenceCase(risk)
}

export function partitionWorktreesIntoBoardLanes(worktrees: Worktree[]): BoardLane[] {
  const byLane = new Map<BoardLaneId, Worktree[]>(
    LANE_DEFINITIONS.map((lane) => [lane.id, []])
  )

  for (const worktree of worktrees) {
    byLane.get(boardLaneIdForWorktree(worktree))!.push(worktree)
  }

  return LANE_DEFINITIONS.map((definition) => {
    const laneWorktrees = byLane.get(definition.id)!
    return {
      ...definition,
      worktrees: laneWorktrees,
      count: laneWorktrees.length,
      diskSize: sumKnownDiskUsage(laneWorktrees)
    }
  }).filter((lane) => lane.id !== 'protected' || lane.count > 0)
}

export interface BoardAggregate {
  count: number
  diskSize: number | null
  safeCount: number
  safeDiskSize: number | null
}

export function aggregateBoardWorktrees(worktrees: Worktree[]): BoardAggregate {
  const linkedWorktrees = worktrees.filter((worktree) => !worktree.isMainWorktree)
  const safeWorktrees = linkedWorktrees.filter((worktree) => worktree.safety.level === 'safe')
  return {
    count: worktrees.length,
    diskSize: sumKnownDiskUsage(linkedWorktrees),
    safeCount: safeWorktrees.length,
    safeDiskSize: sumKnownDiskUsage(safeWorktrees)
  }
}
