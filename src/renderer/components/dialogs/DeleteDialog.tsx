import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2 } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import type { Worktree } from '../../types'

interface DeleteDialogProps {
  worktree: Worktree
  onClose: () => void
  onConfirm: (force: boolean) => void
}

export function DeleteDialog({ worktree, onClose, onConfirm }: DeleteDialogProps) {
  const [force, setForce] = useState(false)
  const displayPath = worktree.path.replace(/^\/Users\/[^/]+/, '~')

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
          className="relative z-10 w-[440px] bg-popover border border-border rounded-xl shadow-2xl p-6"
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-red-500/10">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-text-primary">Delete Worktree</h3>
              <p className="text-sm text-text-secondary mt-1">
                Are you sure you want to delete this worktree? This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="mt-4 bg-surface rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-tertiary">Branch</span>
              <span className="font-mono text-text-primary">{worktree.branch || 'detached HEAD'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-tertiary">Path</span>
              <span className="font-mono text-text-primary truncate ml-4 max-w-[280px]" title={worktree.path}>
                {displayPath}
              </span>
            </div>
            {worktree.diskSize && (
              <div className="flex justify-between text-xs">
                <span className="text-text-tertiary">Size</span>
                <span className="text-text-primary">{prettyBytes(worktree.diskSize)}</span>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border bg-surface text-red-500 focus:ring-red-500/20 focus:ring-offset-0"
            />
            <span className="text-xs text-text-secondary">Force delete (even if worktree has changes)</span>
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
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
