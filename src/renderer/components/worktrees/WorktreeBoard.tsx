import { AlertTriangle, GitBranch, Lock, ShieldCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import prettyBytes from 'pretty-bytes'
import {
  getBoardSafetySummary,
  partitionWorktreesIntoBoardLanes,
  type BoardLane
} from '../../lib/board'
import { DivergenceBadge } from './DivergenceBadge'
import { SourceBadge } from './SourceBadge'
import { WorktreeActionMenu } from './WorktreeActionMenu'
import type { Worktree } from '../../types'
import type { SelectionModel, WorktreeOperations } from './worktree-browser-types'

interface WorktreeBoardProps {
  worktrees: Worktree[]
  selection: SelectionModel
  operations: WorktreeOperations
  focusedWorktreeId: string | null
  onInspect: (worktree: Worktree) => void
}

export function WorktreeBoard({
  worktrees,
  selection,
  operations,
  focusedWorktreeId,
  onInspect
}: WorktreeBoardProps) {
  const lanes = partitionWorktreesIntoBoardLanes(worktrees)

  return (
    <div className="worktree-board" aria-label="Worktrees grouped by removal safety">
      {lanes.map((lane) => (
        <BoardLaneSection
          key={lane.id}
          lane={lane}
          selection={selection}
          operations={operations}
          focusedWorktreeId={focusedWorktreeId}
          onInspect={onInspect}
        />
      ))}
    </div>
  )
}

interface BoardLaneSectionProps extends Omit<WorktreeBoardProps, 'worktrees'> {
  lane: BoardLane
}

function BoardLaneSection({
  lane,
  selection,
  operations,
  focusedWorktreeId,
  onInspect
}: BoardLaneSectionProps) {
  const headingId = `board-lane-${lane.id}`
  const removableIds = lane.worktrees
    .filter((worktree) => !worktree.isMainWorktree)
    .map((worktree) => worktree.id)
  const selectedCount = removableIds.filter((id) => selection.isSelected(id)).length
  const allSelected = removableIds.length > 0 && selectedCount === removableIds.length

  const toggleLaneSelection = () => {
    if (allSelected) {
      const laneIds = new Set(removableIds)
      selection.selectAll(Array.from(selection.selected).filter((id) => !laneIds.has(id)))
      return
    }
    selection.selectAll(new Set([...Array.from(selection.selected), ...removableIds]))
  }

  return (
    <section className={`board-lane board-lane-${lane.id}`} aria-labelledby={headingId}>
      <header className="board-lane-header">
        <span className="board-lane-dot" aria-hidden="true" />
        <div className="board-lane-title">
          <h2 id={headingId}>{lane.label}</h2>
          <span>{lane.count}</span>
        </div>
        <p>{lane.description}</p>
        <div className="board-lane-meta">
          <code>{lane.diskSize === null ? '—' : prettyBytes(lane.diskSize)}</code>
          {removableIds.length > 0 && (
            <button type="button" className="text-button" onClick={toggleLaneSelection}>
              {allSelected ? 'Clear lane' : 'Select lane'}
            </button>
          )}
        </div>
      </header>

      {lane.worktrees.length === 0 ? (
        <div className="board-lane-empty">
          {lane.id === 'safe'
            ? 'No worktrees are currently verified safe to remove.'
            : lane.id === 'caution'
              ? 'Nothing needs a manual review.'
              : 'No local work is currently at risk.'}
        </div>
      ) : (
        <div className="board-card-grid">
          {lane.worktrees.map((worktree) => (
            <WorktreeBoardCard
              key={worktree.id}
              worktree={worktree}
              selected={selection.isSelected(worktree.id)}
              focused={focusedWorktreeId === worktree.id}
              onToggle={() => selection.toggle(worktree.id)}
              onInspect={() => onInspect(worktree)}
              operations={operations}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface WorktreeBoardCardProps {
  worktree: Worktree
  selected: boolean
  focused: boolean
  onToggle: () => void
  onInspect: () => void
  operations: WorktreeOperations
}

function WorktreeBoardCard({
  worktree,
  selected,
  focused,
  onToggle,
  onInspect,
  operations
}: WorktreeBoardCardProps) {
  const displayPath = worktree.path.replace(/^\/Users\/[^/]+/, '~')
  const updated = worktree.lastModified
    ? formatDistanceToNow(new Date(worktree.lastModified), { addSuffix: true })
    : 'Unknown'
  const reason = getBoardSafetySummary(worktree)
  const ReasonIcon = worktree.safety.level === 'safe' ? ShieldCheck : AlertTriangle

  return (
    <article
      className={[
        'board-card',
        `board-card-${worktree.isMainWorktree ? 'protected' : worktree.safety.level}`,
        selected && 'is-selected',
        focused && 'is-focused'
      ].filter(Boolean).join(' ')}
      aria-label={`${worktree.branch || 'Detached HEAD'} in ${worktree.repoName}`}
    >
      <div className="board-card-topline">
        {worktree.isMainWorktree ? (
          <Lock className="board-card-lock" aria-label="Main checkout cannot be removed" />
        ) : (
          <input
            type="checkbox"
            aria-label={`Select ${worktree.branch || 'detached worktree'}`}
            checked={selected}
            onChange={onToggle}
          />
        )}

        <button type="button" className="board-card-title" onClick={onInspect}>
          <GitBranch aria-hidden="true" />
          <span>{worktree.branch || 'Detached HEAD'}</span>
        </button>

        {worktree.prInfo && (
          <button
            type="button"
            className="pr-link"
            onClick={() => void window.api.openUrl(worktree.prInfo!.url)}
            aria-label={`Open pull request ${worktree.prInfo.number}: ${worktree.prInfo.title}`}
          >
            #{worktree.prInfo.number}
          </button>
        )}

        <WorktreeActionMenu
          worktree={worktree}
          lockPending={operations.pendingLockPaths.has(worktree.path)}
          onLockChange={operations.changeLock}
          onDelete={operations.requestDelete}
        />
      </div>

      <button type="button" className="board-card-body" onClick={onInspect}>
        <span className="board-card-context">
          <SourceBadge source={worktree.source} />
          <span>{worktree.repoName}</span>
          {worktree.divergence && (
            <DivergenceBadge
              ahead={worktree.divergence.ahead}
              behind={worktree.divergence.behind}
              focusable={false}
            />
          )}
        </span>

        {worktree.summary && <span className="board-card-summary">{worktree.summary}</span>}
        <code className="board-card-path" title={worktree.path}>{displayPath}</code>

        <span className="board-card-reason">
          <ReasonIcon aria-hidden="true" />
          <span>{reason}</span>
        </span>

        <span className="board-card-footer">
          <span>Updated {updated}</span>
          <code>{worktree.diskSize == null ? '—' : prettyBytes(worktree.diskSize)}</code>
        </span>
      </button>
    </article>
  )
}
