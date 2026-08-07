import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Columns3,
  List,
  RefreshCw,
  SearchX,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { useAppStore } from '../../stores/app-store'
import {
  useDeleteWorktree,
  useDeleteWorktrees,
  useLockWorktree,
  useSaveSettings,
  useSettings,
  useUnlockWorktree
} from '../../hooks/useWorktrees'
import { aggregateBoardWorktrees } from '../../lib/board'
import { WorktreeBoard } from './WorktreeBoard'
import { WorktreeInspector } from './WorktreeInspector'
import { WorktreeList } from './WorktreeList'
import { DeleteDialog } from '../dialogs/DeleteDialog'
import { BulkDeleteDialog } from '../dialogs/BulkDeleteDialog'
import type { Worktree, WorktreeSource, WorktreeStatus, WorktreeView } from '../../types'
import type { SelectionModel, WorktreeOperations } from './worktree-browser-types'

interface WorktreeWorkspaceProps {
  worktrees: Worktree[]
  scopedWorktrees: Worktree[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  selection: SelectionModel
  scopeKey: string | null
  selectedRepoName: string | null
  onRetry: () => void
  onOpenSettings: () => void
}

interface HotModuleApi {
  on: (event: 'vite:beforeUpdate', callback: () => void) => void
  off: (event: 'vite:beforeUpdate', callback: () => void) => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'The operation could not be completed.'
}

export function WorktreeWorkspace({
  worktrees,
  scopedWorktrees,
  isLoading,
  isFetching,
  error,
  selection,
  scopeKey,
  selectedRepoName,
  onRetry,
  onOpenSettings
}: WorktreeWorkspaceProps) {
  const {
    worktreeView,
    setWorktreeView,
    sourceFilter,
    statusFilter,
    setSourceFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    sortDirection,
    toggleSortDirection,
    hideMainWorktrees,
    setHideMainWorktrees,
    searchQuery,
    setSearchQuery
  } = useAppStore()
  const { data: settings } = useSettings()
  const saveSettings = useSaveSettings()
  const deleteWorktree = useDeleteWorktree()
  const deleteWorktrees = useDeleteWorktrees()
  const lockWorktree = useLockWorktree()
  const unlockWorktree = useUnlockWorktree()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [focusedWorktreeId, setFocusedWorktreeId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Worktree | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<Array<{ path: string; error: string }>>([])
  const [lockError, setLockError] = useState<{ path: string; message: string } | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [pendingLockPaths, setPendingLockPaths] = useState<Set<string>>(() => new Set())
  const lastScope = useRef<string | null>(null)

  useEffect(() => {
    const hot = (import.meta as ImportMeta & { hot?: HotModuleApi }).hot
    const closeDestructiveSurfaces = () => {
      setDeleteTarget(null)
      setShowBulkDelete(false)
      setDeleteError(null)
      setBulkErrors([])
    }
    hot?.on('vite:beforeUpdate', closeDestructiveSurfaces)
    return () => hot?.off('vite:beforeUpdate', closeDestructiveSurfaces)
  }, [])

  const aggregate = useMemo(() => aggregateBoardWorktrees(scopedWorktrees), [scopedWorktrees])
  const focusedWorktree = worktrees.find((worktree) => worktree.id === focusedWorktreeId) ?? null
  const removableWorktrees = worktrees.filter((worktree) => !worktree.isMainWorktree)
  const selectedWorktrees = removableWorktrees.filter((worktree) => selection.isSelected(worktree.id))
  const selectedSafeCount = selectedWorktrees.filter((worktree) => worktree.safety.level === 'safe').length
  const selectedDiskSize = selectedWorktrees.reduce(
    (total, worktree) => total + (worktree.diskSize ?? 0),
    0
  )
  const selectedDiskSizeKnown = selectedWorktrees.every((worktree) => worktree.diskSize !== null)
  const activeFilterCount = Number(sourceFilter !== 'all')
    + Number(statusFilter !== 'all')
    + Number(Boolean(searchQuery.trim()))

  useEffect(() => {
    const scope = scopeKey ?? '__all__'
    if (lastScope.current !== scope) {
      lastScope.current = scope
      const suggestedWorktree = worktrees.find((worktree) =>
        !worktree.isMainWorktree && worktree.safety.level === 'safe'
      ) ?? worktrees[0]
      setFocusedWorktreeId(
        window.matchMedia('(min-width: 1100px)').matches ? suggestedWorktree?.id ?? null : null
      )
      return
    }
    if (focusedWorktreeId && !worktrees.some((worktree) => worktree.id === focusedWorktreeId)) {
      setFocusedWorktreeId(null)
    }
  }, [focusedWorktreeId, scopeKey, worktrees])

  const requestDelete = (worktree: Worktree) => {
    if (worktree.isMainWorktree) return
    setDeleteError(null)
    setDeleteTarget(worktree)
  }

  const changeLock = async (worktree: Worktree, shouldLock: boolean): Promise<boolean> => {
    setLockError(null)
    setPendingLockPaths((current) => new Set(current).add(worktree.path))
    try {
      const variables = { path: worktree.path, repoPath: worktree.repoPath }
      if (shouldLock) await lockWorktree.mutateAsync(variables)
      else await unlockWorktree.mutateAsync(variables)
      return true
    } catch (mutationError) {
      setLockError({ path: worktree.path, message: getErrorMessage(mutationError) })
      return false
    } finally {
      setPendingLockPaths((current) => {
        const next = new Set(current)
        next.delete(worktree.path)
        return next
      })
    }
  }

  const operations: WorktreeOperations = {
    pendingLockPaths,
    requestDelete,
    changeLock
  }

  const handleViewChange = async (view: WorktreeView) => {
    if (view === worktreeView || saveSettings.isPending) return
    const previous = worktreeView
    setViewError(null)
    setWorktreeView(view)
    if (!settings) return
    try {
      await saveSettings.mutateAsync({ ...settings, defaultView: view })
    } catch (saveError) {
      setWorktreeView(previous)
      setViewError(saveError instanceof Error ? saveError.message : 'The view preference could not be saved.')
    }
  }

  const handleSingleDelete = async (force: boolean) => {
    if (!deleteTarget || deleteTarget.isMainWorktree) return
    setDeleteError(null)
    try {
      await deleteWorktree.mutateAsync({
        path: deleteTarget.path,
        repoPath: deleteTarget.repoPath,
        force
      })
      if (focusedWorktreeId === deleteTarget.id) setFocusedWorktreeId(null)
      setDeleteTarget(null)
    } catch (mutationError) {
      setDeleteError(getErrorMessage(mutationError))
    }
  }

  const handleBulkDelete = async (force: boolean) => {
    setBulkErrors([])
    try {
      const outcome = await deleteWorktrees.mutateAsync({
        items: selectedWorktrees.map((worktree) => ({
          path: worktree.path,
          repoPath: worktree.repoPath,
          force
        }))
      })
      if (outcome.failures.length === 0) {
        selection.deselectAll()
        setShowBulkDelete(false)
        return
      }

      const failurePaths = new Set(outcome.failures.map((failure) => failure.path))
      selection.selectAll(selectedWorktrees
        .filter((worktree) => failurePaths.has(worktree.path))
        .map((worktree) => worktree.id))
      setBulkErrors(outcome.failures.map((failure) => ({
        path: failure.path,
        error: failure.error || 'Removal failed'
      })))
    } catch (mutationError) {
      setBulkErrors([{ path: 'Bulk removal', error: getErrorMessage(mutationError) }])
    }
  }

  const clearFilters = () => {
    setSourceFilter('all')
    setStatusFilter('all')
    setSearchQuery('')
  }

  const content = (() => {
    if (isLoading && scopedWorktrees.length === 0) {
      return <BoardLoadingState view={worktreeView} />
    }
    if (error && scopedWorktrees.length === 0) {
      return (
        <div className="workspace-empty-state" role="alert">
          <AlertTriangle aria-hidden="true" />
          <h2>Couldn’t scan worktrees</h2>
          <p>{error.message}</p>
          <button type="button" className="button-secondary" onClick={onRetry} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
            {isFetching ? 'Retrying…' : 'Retry scan'}
          </button>
        </div>
      )
    }
    if (scopedWorktrees.length === 0) {
      return (
        <div className="workspace-empty-state">
          <Columns3 aria-hidden="true" />
          <h2>No linked worktrees</h2>
          <p>Main checkouts stay protected. Add another scan folder if a repository is missing.</p>
          <div>
            <button type="button" className="button-secondary" onClick={onRetry}>Scan again</button>
            <button type="button" className="text-button" onClick={onOpenSettings}>Review scan folders</button>
          </div>
        </div>
      )
    }
    if (worktrees.length === 0) {
      return (
        <div className="workspace-empty-state">
          <SearchX aria-hidden="true" />
          <h2>No worktrees match</h2>
          <p>Clear the current search or filters to return to this repository.</p>
          <button type="button" className="button-secondary" onClick={clearFilters}>Clear filters</button>
        </div>
      )
    }
    return worktreeView === 'board' ? (
      <WorktreeBoard
        worktrees={worktrees}
        selection={selection}
        operations={operations}
        focusedWorktreeId={focusedWorktreeId}
        onInspect={(worktree) => setFocusedWorktreeId(worktree.id)}
      />
    ) : (
      <WorktreeList
        worktrees={worktrees}
        selection={selection}
        operations={operations}
        focusedWorktreeId={focusedWorktreeId}
        onInspect={(worktree) => setFocusedWorktreeId(worktree.id)}
      />
    )
  })()

  return (
    <section className="worktree-workspace" aria-busy={isFetching}>
      <header className="workspace-scope-header">
        <div className="workspace-scope-copy">
          <h1>{selectedRepoName || 'All worktrees'}</h1>
          <p>
            {aggregate.count} worktree{aggregate.count === 1 ? '' : 's'} · {aggregate.safeCount} safe ·{' '}
            {aggregate.diskSize === null || aggregate.safeDiskSize === null ? (
              <strong>Calculating sizes…</strong>
            ) : (
              <><strong>{prettyBytes(aggregate.safeDiskSize)} reclaimable</strong> of {prettyBytes(aggregate.diskSize)}</>
            )}
          </p>
        </div>

        <div className="workspace-header-actions">
          <div className="view-switch" role="group" aria-label="Worktree view">
            <button
              type="button"
              aria-pressed={worktreeView === 'board'}
              onClick={() => void handleViewChange('board')}
            >
              <Columns3 aria-hidden="true" /> Board
            </button>
            <button
              type="button"
              aria-pressed={worktreeView === 'table'}
              onClick={() => void handleViewChange('table')}
            >
              <List aria-hidden="true" /> List
            </button>
          </div>
          <button
            type="button"
            className="workspace-filter-button"
            aria-expanded={filtersOpen}
            aria-controls="worktree-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>Filters</span>
            {activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}
          </button>
        </div>
      </header>

      {filtersOpen && (
        <div id="worktree-filters" className="workspace-filterbar" aria-label="Worktree filters">
          <label>
            <span>Source</span>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as WorktreeSource | 'all')}
            >
              <option value="all">All sources</option>
              <option value="git">Git</option>
              <option value="claude">Claude</option>
              <option value="cursor">Cursor</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as WorktreeStatus | 'all' | 'safe' | 'review')}
            >
              <option value="all">All statuses</option>
              <option value="safe">Safe to remove</option>
              <option value="review">Needs review</option>
              <option value="active">Active</option>
              <option value="stale">Stale</option>
              <option value="locked">Locked</option>
              <option value="prunable">Prunable</option>
              <option value="orphan">Orphan</option>
              <option value="detached">Detached</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
              <option value="lastModified">Last modified</option>
              <option value="diskSize">Disk size</option>
              <option value="branch">Branch</option>
              <option value="name">Repository</option>
              <option value="source">Source</option>
            </select>
          </label>
          <button
            type="button"
            className="toolbar-icon-button"
            onClick={toggleSortDirection}
            aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
          >
            {sortDirection === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
          </button>
          <label className="main-worktree-toggle">
            <input
              type="checkbox"
              checked={!hideMainWorktrees}
              onChange={() => setHideMainWorktrees(!hideMainWorktrees)}
            />
            <span>Show main checkouts</span>
          </label>
          <span className="filterbar-spacer" />
          <button
            type="button"
            className="text-button"
            onClick={() => selection.selectAll(removableWorktrees.map((worktree) => worktree.id))}
            disabled={removableWorktrees.length === 0}
          >
            Select visible
          </button>
          {activeFilterCount > 0 && (
            <button type="button" className="text-button" onClick={clearFilters}>
              <X aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      )}

      {(error && scopedWorktrees.length > 0) && (
        <div className="workspace-banner" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span><strong>Refresh failed.</strong> Showing the last verified scan. {error.message}</span>
          <button type="button" className="text-button" onClick={onRetry} disabled={isFetching}>Retry</button>
        </div>
      )}
      {lockError && (
        <div className="workspace-banner" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span><strong>Lock update failed.</strong> {lockError.message}</span>
          <button type="button" className="toolbar-icon-button" onClick={() => setLockError(null)} aria-label="Dismiss lock error">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      {viewError && (
        <div className="workspace-banner" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span><strong>View preference wasn’t saved.</strong> {viewError}</span>
          <button type="button" className="toolbar-icon-button" onClick={() => setViewError(null)} aria-label="Dismiss view error">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div className={`workspace-body ${focusedWorktree ? 'has-inspector' : ''}`}>
        <div className="workspace-content">{content}</div>
        {focusedWorktree && (
          <WorktreeInspector
            worktree={focusedWorktree}
            operations={operations}
            onClose={() => setFocusedWorktreeId(null)}
          />
        )}
      </div>

      {selectedWorktrees.length > 0 && (
        <div className="workspace-bulkbar" role="region" aria-label="Bulk actions">
          <div>
            <strong>{selectedWorktrees.length} selected</strong>
            <span>
              {selectedDiskSizeKnown ? prettyBytes(selectedDiskSize) : '—'} · {selectedSafeCount} safe,{' '}
              {selectedWorktrees.length - selectedSafeCount} need review
            </span>
          </div>
          <span className="filterbar-spacer" />
          <button type="button" className="text-button" onClick={selection.deselectAll}>Clear</button>
          <button type="button" className="button-secondary" onClick={() => setShowBulkDelete(true)}>
            Review selection
          </button>
          <button type="button" className="button-danger-subtle" onClick={() => setShowBulkDelete(true)}>
            <Trash2 aria-hidden="true" /> Remove {selectedWorktrees.length}…
          </button>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {selectedWorktrees.length === 0
          ? 'No worktrees selected.'
          : `${selectedWorktrees.length} worktrees selected.`}
      </p>

      {deleteTarget && !deleteTarget.isMainWorktree && (
        <DeleteDialog
          worktree={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleSingleDelete}
          isPending={deleteWorktree.isPending}
          error={deleteError}
        />
      )}
      {showBulkDelete && (
        <BulkDeleteDialog
          worktrees={selectedWorktrees}
          onClose={() => {
            setShowBulkDelete(false)
            setBulkErrors([])
          }}
          onConfirm={handleBulkDelete}
          isPending={deleteWorktrees.isPending}
          errors={bulkErrors}
        />
      )}
    </section>
  )
}

function BoardLoadingState({ view }: { view: WorktreeView }) {
  if (view === 'table') {
    return (
      <div className="workspace-loading" role="status">
        <span className="native-spinner" aria-hidden="true" />
        <p>Looking for worktrees…</p>
      </div>
    )
  }

  return (
    <div className="board-skeleton" role="status" aria-label="Scanning repositories">
      {[0, 1, 2].map((lane) => (
        <section key={lane}>
          <span className="skeleton-line skeleton-heading" />
          <div>
            {[0, 1, 2].map((card) => <span key={card} className="skeleton-card" />)}
          </div>
        </section>
      ))}
    </div>
  )
}
