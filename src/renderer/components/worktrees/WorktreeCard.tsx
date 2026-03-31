import { useState } from 'react'
import { MoreHorizontal, FolderOpen, Terminal, Code, MousePointer2, Lock, Unlock, Trash2, GitBranch, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import prettyBytes from 'pretty-bytes'
import { formatDistanceToNow } from 'date-fns'
import { SourceBadge } from './SourceBadge'
import { StatusBadge } from './StatusBadge'
import { SafetyDot } from './SafetyDot'
import { DivergenceBadge } from './DivergenceBadge'
import { Tooltip } from '../ui/Tooltip'
import { cn } from '../../lib/utils'
import type { Worktree, WorktreeStatus } from '../../types'

interface WorktreeCardProps {
  worktree: Worktree
  index: number
  isSelected: boolean
  onToggleSelect: () => void
  onDelete: () => void
  onLock: () => void
  onUnlock: () => void
}

export function WorktreeCard({ worktree, index, isSelected, onToggleSelect, onDelete, onLock, onUnlock }: WorktreeCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const lastMod = worktree.lastModified
    ? formatDistanceToNow(new Date(worktree.lastModified), { addSuffix: true })
    : 'unknown'

  const displayPath = worktree.path.replace(/^\/Users\/[^/]+/, '~')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className={cn(
        'bg-card border rounded-xl p-4 transition-all duration-150 group relative',
        isSelected
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-border-strong'
      )}
    >
      {/* Top row: checkbox + source + actions */}
      <div className="flex items-center gap-2.5 mb-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="w-3.5 h-3.5 rounded border-border bg-surface text-blue-500 focus:ring-blue-500/20 focus:ring-offset-0 cursor-pointer"
        />
        <SourceBadge source={worktree.source} />
        <div className="flex-1" />

        {/* Actions menu */}
        <div className="relative">
          <Tooltip text="Actions">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded-md text-text-faint hover:text-text-primary hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </Tooltip>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-48 bg-popover border border-border rounded-lg shadow-xl py-1 text-sm">
                <button
                  onClick={() => { window.api.openInFinder(worktree.path); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Open in Finder
                </button>
                <button
                  onClick={() => { window.api.openInTerminal(worktree.path); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" /> Open in Terminal
                </button>
                <button
                  onClick={() => { window.api.openInEditor(worktree.path, 'code'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <Code className="w-3.5 h-3.5" /> Open in VS Code
                </button>
                <button
                  onClick={() => { window.api.openInEditor(worktree.path, 'cursor'); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  <MousePointer2 className="w-3.5 h-3.5" /> Open in Cursor
                </button>
                <div className="border-t border-border my-1" />
                {worktree.locked ? (
                  <button
                    onClick={() => { onUnlock(); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Unlock Worktree
                  </button>
                ) : (
                  <button
                    onClick={() => { onLock(); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" /> Lock Worktree
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { onDelete(); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Branch name + safety dot */}
      <div className="flex items-center gap-1.5 mb-1">
        <GitBranch className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
        <span className="font-mono text-sm font-medium text-text-primary truncate">
          {worktree.branch || 'detached HEAD'}
        </span>
        {!worktree.isMainWorktree && (
          <SafetyDot level={worktree.safety.level} reasons={worktree.safety.reasons} />
        )}
        {worktree.divergence && (
          <DivergenceBadge ahead={worktree.divergence.ahead} behind={worktree.divergence.behind} />
        )}
      </div>

      {/* Work summary */}
      {worktree.summary && (
        <p className="text-xs text-text-tertiary italic truncate mb-1" title={worktree.summary}>
          {worktree.summary}
        </p>
      )}

      {/* PR link if available */}
      {worktree.prInfo && (
        <a
          href={worktree.prInfo.url}
          onClick={(e) => {
            e.preventDefault()
            window.api.openUrl(worktree.prInfo!.url)
          }}
          className="flex items-center gap-1.5 mb-2 group/pr"
        >
          <span className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border',
            worktree.prInfo.state === 'OPEN'
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : worktree.prInfo.state === 'MERGED'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
          )}>
            #{worktree.prInfo.number}
          </span>
          <span className="text-xs text-text-tertiary truncate group-hover/pr:text-primary transition-colors">
            {worktree.prInfo.title}
          </span>
          <ExternalLink className="w-3 h-3 text-text-faint group-hover/pr:text-primary flex-shrink-0 transition-colors" />
        </a>
      )}

      {/* Repo name */}
      <div className="mb-1">
        <span className="text-xs text-text-tertiary">{worktree.repoName}</span>
      </div>

      {/* Path */}
      <p className="font-mono text-[11px] text-text-faint truncate mb-3" title={worktree.path}>
        {displayPath}
      </p>

      {/* Status badges */}
      {worktree.statuses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {worktree.statuses.map((status) => (
            <StatusBadge key={status} status={status as WorktreeStatus} />
          ))}
        </div>
      )}

      {/* Bottom row: last modified + disk size */}
      <div className="flex items-center justify-between text-[11px] text-text-faint">
        <span>{lastMod}</span>
        <span className="font-mono">{worktree.diskSize ? prettyBytes(worktree.diskSize) : '...'}</span>
      </div>
    </motion.div>
  )
}
