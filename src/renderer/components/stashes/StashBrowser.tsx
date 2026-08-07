import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, Clock3, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAppStore } from '../../stores/app-store'
import { useDropStash, useDropStashesBefore, useStashes } from '../../hooks/useWorktrees'
import { Dialog } from '../ui/Dialog'
import type { RepoSummary, StashDropResult, StashEntry } from '../../types'

interface StashBrowserProps {
  repos: RepoSummary[]
}

type TimeGroup = 'This week' | 'This month' | 'Older'

const DROP_PRESETS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 }
]

function groupByTime(stashes: StashEntry[]): Record<TimeGroup, StashEntry[]> {
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000
  const groups: Record<TimeGroup, StashEntry[]> = {
    'This week': [],
    'This month': [],
    Older: []
  }

  for (const stash of stashes) {
    const time = new Date(stash.date).getTime()
    if (time >= weekAgo) groups['This week'].push(stash)
    else if (time >= monthAgo) groups['This month'].push(stash)
    else groups.Older.push(stash)
  }
  return groups
}

export function StashBrowser({ repos }: StashBrowserProps) {
  const { stashRepo } = useAppStore()
  const reposWithStashes = useMemo(() => repos.filter((repo) => repo.stashCount > 0), [repos])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(stashRepo)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TimeGroup>>(new Set())
  const [dropTarget, setDropTarget] = useState<StashEntry | null>(null)
  const [bulkDays, setBulkDays] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bulkFailures, setBulkFailures] = useState<StashDropResult[]>([])
  const stashesQuery = useStashes(selectedRepo)
  const dropStash = useDropStash()
  const dropStashesBefore = useDropStashesBefore()
  const stashes = stashesQuery.data || []

  useEffect(() => {
    if (stashRepo && repos.some((repo) => repo.path === stashRepo)) {
      setSelectedRepo(stashRepo)
      return
    }
    if (!selectedRepo || !repos.some((repo) => repo.path === selectedRepo)) {
      setSelectedRepo(reposWithStashes[0]?.path || null)
    }
  }, [stashRepo, repos, reposWithStashes, selectedRepo])

  const groups = useMemo(() => groupByTime(stashes), [stashes])
  const selectedRepoName = repos.find((repo) => repo.path === selectedRepo)?.name || 'Repository'
  const bulkCutoff = bulkDays == null
    ? null
    : Date.now() - bulkDays * 24 * 60 * 60 * 1000
  const bulkCount = bulkCutoff == null
    ? 0
    : stashes.filter((stash) => new Date(stash.date).getTime() < bulkCutoff).length

  const handleDrop = async () => {
    if (!selectedRepo || !dropTarget) return
    setError(null)
    try {
      await dropStash.mutateAsync({ repoPath: selectedRepo, oid: dropTarget.oid })
      setDropTarget(null)
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : 'The stash could not be dropped.')
    }
  }

  const handleBulkDrop = async () => {
    if (!selectedRepo || bulkDays == null) return
    setError(null)
    setBulkFailures([])
    const beforeDate = new Date(Date.now() - bulkDays * 24 * 60 * 60 * 1000).toISOString()
    try {
      const outcome = await dropStashesBefore.mutateAsync({ repoPath: selectedRepo, beforeDate })
      if (outcome.failures.length > 0) {
        setBulkFailures(outcome.failures)
        return
      }
      setBulkDays(null)
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : 'The stashes could not be dropped.')
    }
  }

  const toggleGroup = (group: TimeGroup) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  if (reposWithStashes.length === 0 && !selectedRepo) {
    return (
      <div className="empty-state">
        <Archive aria-hidden="true" />
        <h3>No stashes found</h3>
        <p>Your scanned repositories do not have any saved stashes.</p>
      </div>
    )
  }

  return (
    <section className="stash-browser">
      <header className="stash-toolbar">
        <div>
          <h2>{selectedRepoName}</h2>
          <p>{stashes.length} saved {stashes.length === 1 ? 'stash' : 'stashes'}</p>
        </div>
        <label>
          <span className="sr-only">Repository</span>
          <select value={selectedRepo || ''} onChange={(event) => setSelectedRepo(event.target.value)}>
            {repos.map((repo) => (
              <option key={repo.path} value={repo.path}>{repo.name} ({repo.stashCount})</option>
            ))}
          </select>
        </label>
        {stashes.length > 0 && (
          <label>
            <span className="sr-only">Drop old stashes</span>
            <select
              value=""
              onChange={(event) => {
                setError(null)
                setBulkFailures([])
                setBulkDays(Number(event.target.value))
              }}
              aria-label="Drop old stashes"
            >
              <option value="" disabled>Drop old stashes…</option>
              {DROP_PRESETS.map((preset) => {
                const cutoff = Date.now() - preset.days * 24 * 60 * 60 * 1000
                const count = stashes.filter((stash) => new Date(stash.date).getTime() < cutoff).length
                return (
                  <option key={preset.days} value={preset.days} disabled={count === 0}>
                    Older than {preset.label} ({count})
                  </option>
                )
              })}
            </select>
          </label>
        )}
      </header>

      {error && !dropTarget && bulkDays == null && (
        <div className="inline-error" role="alert">{error}</div>
      )}

      {stashesQuery.isLoading ? (
        <div className="initial-loading" role="status">
          <span className="native-spinner" aria-hidden="true" />
          <p>Loading stashes…</p>
        </div>
      ) : stashesQuery.error ? (
        <div className="inline-error" role="alert">
          <strong>Couldn’t load stashes.</strong>
          <span>{stashesQuery.error.message}</span>
        </div>
      ) : stashes.length === 0 ? (
        <div className="empty-state">
          <Archive aria-hidden="true" />
          <h3>No stashes in this repository</h3>
          <p>Choose another repository or create a stash from Git.</p>
        </div>
      ) : (
        <div className="stash-groups">
          {(Object.keys(groups) as TimeGroup[]).map((group) => {
            const items = groups[group]
            if (items.length === 0) return null
            const collapsed = collapsedGroups.has(group)
            return (
              <section key={group} className="stash-group">
                <button
                  type="button"
                  className="stash-group-heading"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  <strong>{group}</strong>
                  <span>{items.length}</span>
                </button>
                {!collapsed && (
                  <div className="stash-list">
                    {items.map((stash) => (
                      <div key={stash.oid} className="stash-row">
                        <code>stash@{'{'}{stash.index}{'}'}</code>
                        <div>
                          <strong>{stash.message}</strong>
                          <span>
                            <Clock3 aria-hidden="true" />
                            {stash.date ? formatDistanceToNow(new Date(stash.date), { addSuffix: true }) : 'Unknown date'}
                            <code>{stash.branch}</code>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="toolbar-icon-button destructive-icon-button"
                          onClick={() => {
                            setError(null)
                            setDropTarget(stash)
                          }}
                          aria-label={`Drop stash ${stash.index}: ${stash.message}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {dropTarget && (
        <Dialog
          title={`Drop stash@{${dropTarget.index}}?`}
          description="Dropping a stash cannot be undone from this app."
          onClose={() => {
            if (!dropStash.isPending) {
              setError(null)
              setDropTarget(null)
            }
          }}
          footer={(
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setError(null)
                  setDropTarget(null)
                }}
                disabled={dropStash.isPending}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="button-danger" onClick={handleDrop} disabled={dropStash.isPending}>
                <Trash2 aria-hidden="true" /> {dropStash.isPending ? 'Dropping…' : 'Drop stash'}
              </button>
            </>
          )}
        >
          <div className="dialog-summary"><code>{dropTarget.message}</code></div>
          {error && <div className="dialog-error" role="alert">{error}</div>}
        </Dialog>
      )}

      {bulkDays != null && (
        <Dialog
          title={`Drop ${bulkCount} old ${bulkCount === 1 ? 'stash' : 'stashes'}?`}
          description={`This removes stashes older than ${bulkDays} days from ${selectedRepoName}.`}
          onClose={() => {
            if (!dropStashesBefore.isPending) {
              setError(null)
              setBulkFailures([])
              setBulkDays(null)
            }
          }}
          footer={(
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setError(null)
                  setBulkFailures([])
                  setBulkDays(null)
                }}
                disabled={dropStashesBefore.isPending}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="button-danger" onClick={handleBulkDrop} disabled={dropStashesBefore.isPending || bulkCount === 0}>
                <Trash2 aria-hidden="true" /> {dropStashesBefore.isPending ? 'Dropping…' : `Drop ${bulkCount}`}
              </button>
            </>
          )}
        >
          <p className="dialog-warning">Review the repository before continuing; dropped stashes cannot be restored here.</p>
          {bulkFailures.length > 0 && (
            <div className="dialog-error" role="alert">
              <div>
                <strong>{bulkFailures.length} {bulkFailures.length === 1 ? 'stash' : 'stashes'} could not be dropped.</strong>
                {bulkFailures.map((failure) => {
                  const stash = stashes.find((entry) => entry.oid === failure.oid)
                  return (
                    <div key={failure.oid}>
                      <code>{stash ? `stash@{${stash.index}}` : failure.oid.slice(0, 10)}</code>
                      {' — '}{failure.error || 'Git did not provide an error.'}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {error && <div className="dialog-error" role="alert">{error}</div>}
        </Dialog>
      )}
    </section>
  )
}
