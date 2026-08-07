import { GitBranch, Lock } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { formatDistanceToNow } from 'date-fns'
import { DivergenceBadge } from './DivergenceBadge'
import { SafetyDot } from './SafetyDot'
import { SourceBadge } from './SourceBadge'
import { StatusBadge } from './StatusBadge'
import { WorktreeActionMenu } from './WorktreeActionMenu'
import type { Worktree } from '../../types'
import type { SelectionModel, WorktreeOperations } from './worktree-browser-types'

interface WorktreeListProps {
  worktrees: Worktree[]
  selection: SelectionModel
  operations: WorktreeOperations
  focusedWorktreeId: string | null
  onInspect: (worktree: Worktree) => void
}

export function WorktreeList({
  worktrees,
  selection,
  operations,
  focusedWorktreeId,
  onInspect
}: WorktreeListProps) {
  const removable = worktrees.filter((worktree) => !worktree.isMainWorktree)
  const selectedCount = removable.filter((worktree) => selection.isSelected(worktree.id)).length
  const allVisibleSelected = removable.length > 0 && selectedCount === removable.length

  return (
    <div className="worktree-table-wrap">
      <table className="worktree-table">
        <thead>
          <tr>
            <th className="selection-column">
              <input
                type="checkbox"
                aria-label="Select all visible worktrees"
                checked={allVisibleSelected}
                ref={(element) => {
                  if (element) element.indeterminate = selectedCount > 0 && !allVisibleSelected
                }}
                onChange={() => {
                  if (allVisibleSelected) selection.deselectAll()
                  else selection.selectAll(removable.map((worktree) => worktree.id))
                }}
              />
            </th>
            <th>Worktree</th>
            <th>Repository</th>
            <th>Safety</th>
            <th className="optional-column">Branch state</th>
            <th>Updated</th>
            <th className="numeric-column">Size</th>
            <th className="actions-column"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {worktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.id}
              worktree={worktree}
              selected={selection.isSelected(worktree.id)}
              focused={focusedWorktreeId === worktree.id}
              onToggle={() => selection.toggle(worktree.id)}
              onInspect={() => onInspect(worktree)}
              operations={operations}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface WorktreeRowProps {
  worktree: Worktree
  selected: boolean
  focused: boolean
  onToggle: () => void
  onInspect: () => void
  operations: WorktreeOperations
}

function WorktreeRow({
  worktree,
  selected,
  focused,
  onToggle,
  onInspect,
  operations
}: WorktreeRowProps) {
  const displayPath = worktree.path.replace(/^\/Users\/[^/]+/, '~')
  const updated = worktree.lastModified
    ? formatDistanceToNow(new Date(worktree.lastModified), { addSuffix: true })
    : 'Unknown'

  return (
    <tr className={[selected && 'is-selected', focused && 'is-focused'].filter(Boolean).join(' ') || undefined}>
      <td className="selection-column">
        {worktree.isMainWorktree ? (
          <Lock className="main-lock" aria-label="Main checkout cannot be removed" />
        ) : (
          <input
            type="checkbox"
            aria-label={`Select ${worktree.branch || 'detached worktree'}`}
            checked={selected}
            onChange={onToggle}
          />
        )}
      </td>
      <td className="worktree-primary-cell">
        <div className="branch-line">
          <GitBranch aria-hidden="true" />
          <button type="button" className="worktree-name-button" onClick={onInspect}>
            {worktree.branch || 'Detached HEAD'}
          </button>
          {worktree.isMainWorktree && <span className="main-label">Main</span>}
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
        </div>
        {worktree.summary && <p title={worktree.summary}>{worktree.summary}</p>}
        <code title={worktree.path}>{displayPath}</code>
      </td>
      <td className="repo-cell">
        <strong>{worktree.repoName}</strong>
        <SourceBadge source={worktree.source} />
      </td>
      <td>
        {worktree.isMainWorktree
          ? <span className="muted-value">Protected</span>
          : <SafetyDot level={worktree.safety.level} reasons={worktree.safety.reasons} />}
      </td>
      <td className="optional-column branch-state-cell">
        {worktree.divergence && (
          <DivergenceBadge ahead={worktree.divergence.ahead} behind={worktree.divergence.behind} />
        )}
        <div className="row-statuses">
          {worktree.statuses
            .filter((status) => status !== 'active')
            .slice(0, 2)
            .map((status) => <StatusBadge key={status} status={status} />)}
        </div>
      </td>
      <td className="muted-value">{updated}</td>
      <td className="numeric-column">
        <code>{worktree.diskSize == null ? '—' : prettyBytes(worktree.diskSize)}</code>
      </td>
      <td className="actions-column">
        <WorktreeActionMenu
          worktree={worktree}
          lockPending={operations.pendingLockPaths.has(worktree.path)}
          onLockChange={operations.changeLock}
          onDelete={operations.requestDelete}
        />
      </td>
    </tr>
  )
}
