import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Archive, Trash2, Clock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAppStore } from '../../stores/app-store'
import type { RepoSummary, StashEntry } from '../../types'

interface StashBrowserProps {
  repos: RepoSummary[]
}

type TimeGroup = 'This week' | 'This month' | 'Older'

function groupByTime(stashes: StashEntry[]): Record<TimeGroup, StashEntry[]> {
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000

  const groups: Record<TimeGroup, StashEntry[]> = {
    'This week': [],
    'This month': [],
    'Older': []
  }

  for (const s of stashes) {
    const t = new Date(s.date).getTime()
    if (t >= weekAgo) groups['This week'].push(s)
    else if (t >= monthAgo) groups['This month'].push(s)
    else groups['Older'].push(s)
  }

  return groups
}

export function StashBrowser({ repos }: StashBrowserProps) {
  const { stashRepo } = useAppStore()
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(stashRepo)
  const [dropConfirm, setDropConfirm] = useState<number | null>(null)
  const [bulkDropAge, setBulkDropAge] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TimeGroup>>(new Set())

  const reposWithStashes = useMemo(
    () => repos.filter((r) => r.stashCount > 0),
    [repos]
  )

  // Auto-select first repo with stashes if none selected
  useEffect(() => {
    if (!selectedRepo && reposWithStashes.length > 0) {
      setSelectedRepo(reposWithStashes[0].path)
    }
  }, [reposWithStashes, selectedRepo])

  // Update selectedRepo when stashRepo changes from sidebar
  useEffect(() => {
    if (stashRepo) setSelectedRepo(stashRepo)
  }, [stashRepo])

  // Load stashes for selected repo
  useEffect(() => {
    if (!selectedRepo) return
    setLoading(true)
    window.api.listStashes(selectedRepo).then((result) => {
      setStashes(result)
      setLoading(false)
    })
  }, [selectedRepo])

  const groups = useMemo(() => groupByTime(stashes), [stashes])
  const selectedRepoName = repos.find((r) => r.path === selectedRepo)?.name || ''

  const handleDrop = async (index: number) => {
    if (!selectedRepo) return
    await window.api.dropStash(selectedRepo, index)
    const updated = await window.api.listStashes(selectedRepo)
    setStashes(updated)
    setDropConfirm(null)
  }

  const handleBulkDrop = async (days: number) => {
    if (!selectedRepo) return
    const beforeDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const count = await window.api.dropStashesBefore(selectedRepo, beforeDate)
    if (count > 0) {
      const updated = await window.api.listStashes(selectedRepo)
      setStashes(updated)
    }
    setBulkDropAge(null)
  }

  const toggleGroup = (group: TimeGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  if (reposWithStashes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Archive className="w-12 h-12 text-text-faint mx-auto mb-3" />
          <p className="text-sm text-text-secondary">No stashes found</p>
          <p className="text-xs text-text-faint mt-1">Your repositories are stash-free</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Repo selector + header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-500/10">
            <Archive className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Stash Browser</h2>
            <p className="text-xs text-text-tertiary">{stashes.length} stash{stashes.length !== 1 ? 'es' : ''} in {selectedRepoName}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Bulk actions */}
          {stashes.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setBulkDropAge(bulkDropAge ? null : 'menu')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Drop old stashes...
              </button>
              {bulkDropAge === 'menu' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBulkDropAge(null)} />
                  <div className="absolute right-0 top-10 z-20 w-52 bg-popover border border-border rounded-lg shadow-xl py-1.5 text-sm">
                    {[
                      { label: 'Older than 30 days', days: 30 },
                      { label: 'Older than 60 days', days: 60 },
                      { label: 'Older than 90 days', days: 90 },
                      { label: 'Older than 6 months', days: 180 }
                    ].map((opt) => {
                      const cutoff = Date.now() - opt.days * 24 * 60 * 60 * 1000
                      const count = stashes.filter((s) => new Date(s.date).getTime() < cutoff).length
                      return (
                        <button
                          key={opt.days}
                          onClick={() => handleBulkDrop(opt.days)}
                          disabled={count === 0}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <span className="text-xs">{opt.label}</span>
                          <span className="text-xs text-text-faint">{count} stash{count !== 1 ? 'es' : ''}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Repo picker */}
          <select
            value={selectedRepo || ''}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="bg-surface border border-border rounded-lg text-sm text-text-secondary px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {reposWithStashes.map((r) => (
              <option key={r.path} value={r.path}>
                {r.name} ({r.stashCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stash list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="inline-block w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : stashes.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Archive className="w-8 h-8 text-text-faint mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No stashes in this repository</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(groups) as TimeGroup[]).map((group) => {
            const items = groups[group]
            if (items.length === 0) return null
            const collapsed = collapsedGroups.has(group)

            return (
              <motion.div
                key={group}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-surface-hover transition-colors"
                >
                  {collapsed ? (
                    <ChevronRight className="w-4 h-4 text-text-faint" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-faint" />
                  )}
                  <span className="text-sm font-medium text-text-primary">{group}</span>
                  <span className="text-xs text-text-tertiary ml-1">({items.length})</span>
                </button>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-border/50">
                        {items.map((stash) => (
                          <div
                            key={stash.index}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors group"
                          >
                            <span className="text-[11px] font-mono text-text-faint w-6 text-right flex-shrink-0">
                              {stash.index}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-text-primary truncate">{stash.message}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {stash.date ? formatDistanceToNow(new Date(stash.date), { addSuffix: true }) : 'unknown'}
                                </span>
                                <span className="text-[10px] text-text-faint font-mono px-1.5 py-0.5 bg-surface rounded">
                                  {stash.branch}
                                </span>
                              </div>
                            </div>
                            {dropConfirm === stash.index ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleDrop(stash.index)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-[11px] rounded transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDropConfirm(null)}
                                  className="px-2 py-1 text-text-secondary hover:text-text-primary text-[11px] rounded hover:bg-surface transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDropConfirm(stash.index)}
                                className="p-1.5 rounded-md text-text-faint hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
