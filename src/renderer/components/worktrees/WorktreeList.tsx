import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, X, Filter, ArrowUpDown, GitBranch, FolderOpen, Terminal, Code, MousePointer2, MoreHorizontal, ExternalLink, Eye, EyeOff } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { formatDistanceToNow } from 'date-fns'
import { useAppStore } from '../../stores/app-store'
import { useDeleteWorktree, useLockWorktree, useUnlockWorktree } from '../../hooks/useWorktrees'
import { WorktreeCard } from './WorktreeCard'
import { SourceBadge } from './SourceBadge'
import { StatusBadge } from './StatusBadge'
import { SafetyDot } from './SafetyDot'
import { DivergenceBadge } from './DivergenceBadge'
import { Tooltip } from '../ui/Tooltip'
import { DeleteDialog } from '../dialogs/DeleteDialog'
import { BulkDeleteDialog } from '../dialogs/BulkDeleteDialog'
import { cn } from '../../lib/utils'
import type { Worktree, WorktreeSource, WorktreeStatus } from '../../types'

interface WorktreeListProps {
  worktrees: Worktree[]
  isLoading: boolean
  selection: {
    selected: Set<string>
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    deselectAll: () => void
    count: number
  }
}

export function WorktreeList({ worktrees, isLoading, selection }: WorktreeListProps) {
  const { viewMode, sourceFilter, statusFilter, setSourceFilter, setStatusFilter, sortBy, setSortBy, sortDirection, toggleSortDirection, hideMainWorktrees, setHideMainWorktrees } = useAppStore()
  const deleteWorktree = useDeleteWorktree()
  const lockWorktree = useLockWorktree()
  const unlockWorktree = useUnlockWorktree()

  const [deleteTarget, setDeleteTarget] = useState<Worktree | null>(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)

  const selectedWorktrees = useMemo(
    () => worktrees.filter((w) => selection.isSelected(w.id)),
    [worktrees, selection]
  )

  if (isLoading && worktrees.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary mt-4">Loading worktrees...</p>
        </div>
      </div>
    )
  }

  if (worktrees.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <GitBranch className="w-12 h-12 text-text-faint mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No worktrees found</p>
          <p className="text-xs text-text-faint mt-1">Try adjusting your filters or scanning a different directory</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-text-tertiary">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs">Source:</span>
        </div>
        {(['all', 'git', 'claude', 'cursor'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
              sourceFilter === s
                ? 'bg-surface-active text-text-primary border-border-strong'
                : 'text-text-faint border-border hover:border-border-strong hover:text-text-secondary'
            )}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}

        <div className="w-px h-5 bg-border" />

        <div className="flex items-center gap-1 text-text-tertiary">
          <span className="text-xs">Status:</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as WorktreeStatus | 'all')}
          className="bg-surface border border-border rounded-md text-xs text-text-secondary px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="stale">Stale</option>
          <option value="locked">Locked</option>
          <option value="prunable">Prunable</option>
          <option value="orphan">Orphan</option>
          <option value="detached">Detached</option>
          <option value="safe">Safe to Delete</option>
        </select>

        <div className="w-px h-5 bg-border" />

        <Tooltip text={`Sort by ${sortBy}`}>
          <button
            onClick={() => {
              setSortBy(sortBy === 'lastModified' ? 'diskSize' : sortBy === 'diskSize' ? 'name' : sortBy === 'name' ? 'source' : 'lastModified')
            }}
            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ArrowUpDown className="w-3 h-3" />
            {sortBy === 'lastModified' ? 'Modified' : sortBy === 'diskSize' ? 'Size' : sortBy === 'name' ? 'Name' : 'Source'}
          </button>
        </Tooltip>
        <button
          onClick={toggleSortDirection}
          className="text-xs text-text-faint hover:text-text-secondary transition-colors"
        >
          {sortDirection === 'desc' ? '↓' : '↑'}
        </button>

        <div className="w-px h-5 bg-border" />

        <Tooltip text={hideMainWorktrees ? 'Show main worktrees' : 'Hide main worktrees'}>
          <button
            onClick={() => setHideMainWorktrees(!hideMainWorktrees)}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors px-2 py-1 rounded-md border',
              hideMainWorktrees
                ? 'text-text-faint border-border hover:text-text-secondary'
                : 'text-text-secondary border-border-strong bg-surface'
            )}
          >
            {hideMainWorktrees ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            Main
          </button>
        </Tooltip>

        <div className="flex-1" />

        <button
          onClick={() => selection.selectAll(worktrees.map(w => w.id))}
          className="text-xs text-text-faint hover:text-text-secondary transition-colors"
        >
          Select all
        </button>
      </div>

      {/* Bulk actions bar */}
      <AnimatePresence>
        {selection.count > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5">
              <span className="text-sm text-primary font-medium">
                {selection.count} selected
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-md text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Selected
              </button>
              <button
                onClick={selection.deselectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-text-secondary hover:text-text-primary rounded-md text-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card view */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {worktrees.map((wt, i) => (
            <WorktreeCard
              key={wt.id}
              worktree={wt}
              index={i}
              isSelected={selection.isSelected(wt.id)}
              onToggleSelect={() => selection.toggle(wt.id)}
              onDelete={() => setDeleteTarget(wt)}
              onLock={() => lockWorktree.mutate({ path: wt.path, repoPath: wt.repoPath })}
              onUnlock={() => unlockWorktree.mutate({ path: wt.path, repoPath: wt.repoPath })}
            />
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-tertiary uppercase tracking-wider">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={selection.count === worktrees.length && worktrees.length > 0}
                    onChange={() => {
                      if (selection.count === worktrees.length) {
                        selection.deselectAll()
                      } else {
                        selection.selectAll(worktrees.map(w => w.id))
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-border bg-surface text-blue-500 cursor-pointer"
                  />
                </th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Branch</th>
                <th className="text-left p-3 font-medium">Summary</th>
                <th className="text-left p-3 font-medium">Repo</th>
                <th className="text-left p-3 font-medium">PR</th>
                <th className="text-center p-3 font-medium">Safe</th>
                <th className="text-left p-3 font-medium">Ahead/Behind</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Modified</th>
                <th className="text-right p-3 font-medium">Size</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {worktrees.map((wt, i) => (
                <motion.tr
                  key={wt.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.015 }}
                  className={cn(
                    'border-b border-border/50 transition-colors',
                    selection.isSelected(wt.id) ? 'bg-primary/5' : 'hover:bg-surface-hover'
                  )}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(wt.id)}
                      onChange={() => selection.toggle(wt.id)}
                      className="w-3.5 h-3.5 rounded border-border bg-surface text-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3"><SourceBadge source={wt.source} /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="w-3 h-3 text-text-faint flex-shrink-0" />
                      <span className="font-mono text-xs text-text-primary max-w-[180px] truncate">
                        {wt.branch || 'detached'}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="text-xs text-text-tertiary italic truncate block max-w-[200px]" title={wt.summary}>
                      {wt.summary || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-text-secondary">{wt.repoName}</td>
                  <td className="p-3">
                    {wt.prInfo ? (
                      <button
                        onClick={() => window.api.openUrl(wt.prInfo!.url)}
                        className="flex items-center gap-1 group/pr"
                      >
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          wt.prInfo.state === 'OPEN'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : wt.prInfo.state === 'MERGED'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                        )}>
                          #{wt.prInfo.number}
                        </span>
                        <ExternalLink className="w-3 h-3 text-text-faint group-hover/pr:text-primary transition-colors" />
                      </button>
                    ) : (
                      <span className="text-xs text-text-faint">-</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {!wt.isMainWorktree && (
                      <SafetyDot level={wt.safety.level} reasons={wt.safety.reasons} />
                    )}
                  </td>
                  <td className="p-3">
                    {wt.divergence ? (
                      <DivergenceBadge ahead={wt.divergence.ahead} behind={wt.divergence.behind} />
                    ) : (
                      <span className="text-xs text-text-faint">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {wt.statuses.map((s) => (
                        <StatusBadge key={s} status={s as WorktreeStatus} />
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-text-tertiary">
                    {wt.lastModified ? formatDistanceToNow(new Date(wt.lastModified), { addSuffix: true }) : '-'}
                  </td>
                  <td className="p-3 text-xs text-text-tertiary text-right font-mono">
                    {wt.diskSize ? prettyBytes(wt.diskSize) : '...'}
                  </td>
                  <td className="p-3">
                    <TableRowActions worktree={wt} onDelete={() => setDeleteTarget(wt)} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          worktree={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={(force) => {
            deleteWorktree.mutate({ path: deleteTarget.path, repoPath: deleteTarget.repoPath, force })
            setDeleteTarget(null)
          }}
        />
      )}

      {/* Bulk delete dialog */}
      {showBulkDelete && (
        <BulkDeleteDialog
          worktrees={selectedWorktrees}
          onClose={() => setShowBulkDelete(false)}
          onConfirm={(force) => {
            for (const wt of selectedWorktrees) {
              deleteWorktree.mutate({ path: wt.path, repoPath: wt.repoPath, force })
            }
            selection.deselectAll()
            setShowBulkDelete(false)
          }}
        />
      )}
    </div>
  )
}

function TableRowActions({ worktree, onDelete }: { worktree: Worktree; onDelete: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Tooltip text="Actions">
        <button
          onClick={() => setOpen(!open)}
          className="p-1 rounded-md text-text-faint hover:text-text-primary hover:bg-surface-hover transition-all"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </Tooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-popover border border-border rounded-lg shadow-xl py-1 text-xs">
            <button
              onClick={() => { window.api.openInFinder(worktree.path); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Finder
            </button>
            <button
              onClick={() => { window.api.openInTerminal(worktree.path); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" /> Terminal
            </button>
            <button
              onClick={() => { window.api.openInEditor(worktree.path, 'code'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <Code className="w-3.5 h-3.5" /> VS Code
            </button>
            <button
              onClick={() => { window.api.openInEditor(worktree.path, 'cursor'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <MousePointer2 className="w-3.5 h-3.5" /> Cursor
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { onDelete(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
