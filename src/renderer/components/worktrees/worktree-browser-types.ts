import type { Worktree } from '../../types'

export interface SelectionModel {
  selected: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  selectAll: (ids: Iterable<string>) => void
  deselectAll: () => void
  count: number
}

export interface WorktreeOperations {
  pendingLockPaths: ReadonlySet<string>
  requestDelete: (worktree: Worktree) => void
  changeLock: (worktree: Worktree, shouldLock: boolean) => Promise<boolean>
}
