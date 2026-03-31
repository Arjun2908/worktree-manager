import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2 } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { SourceBadge } from '../worktrees/SourceBadge'
import type { Worktree } from '../../types'

interface BulkDeleteDialogProps {
  worktrees: Worktree[]
  onClose: () => void
  onConfirm: (force: boolean) => void
}

export function BulkDeleteDialog({ worktrees, onClose, onConfirm }: BulkDeleteDialogProps) {
  const [force, setForce] = useState(false)
  const totalSize = worktrees.reduce((sum, w) => sum + (w.diskSize || 0), 0)

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 w-[500px] bg-popover border border-border rounded-xl shadow-2xl p-6"
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-text-primary">Delete {worktrees.length} Worktrees</h3>
              <p className="text-sm text-text-secondary mt-1">
                This will free up {prettyBytes(totalSize)} of disk space. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-[240px] overflow-auto bg-surface rounded-lg divide-y divide-border">
            {worktrees.map((wt) => (
              <div key={wt.id} className="flex items-center gap-3 px-3 py-2">
                <SourceBadge source={wt.source} />
                <span className="font-mono text-xs text-text-primary truncate flex-1">
                  {wt.branch || 'detached'}
                </span>
                <span className="text-xs text-text-tertiary">{wt.repoName}</span>
                <span className="text-xs text-text-faint font-mono">
                  {wt.diskSize ? prettyBytes(wt.diskSize) : ''}
                </span>
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border bg-surface text-red-500 focus:ring-red-500/20 focus:ring-offset-0"
            />
            <span className="text-xs text-text-secondary">Force delete all (even with uncommitted changes)</span>
          </label>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(force)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete {worktrees.length} Worktrees
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
