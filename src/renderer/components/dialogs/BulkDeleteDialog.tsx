import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { Dialog } from '../ui/Dialog'
import { useRemovalConfirmationArm } from '../../hooks/useRemovalConfirmationArm'
import {
  canInvokeRemoval,
  isRemovalConfirmationValid,
  removalConfirmationPhrase
} from '../../lib/delete-confirmation'
import type { Worktree } from '../../types'

interface BulkDeleteDialogProps {
  worktrees: Worktree[]
  onClose: () => void
  onConfirm: (force: boolean) => void
  isPending?: boolean
  errors?: Array<{ path: string; error: string }>
}

export function BulkDeleteDialog({
  worktrees,
  onClose,
  onConfirm,
  isPending = false,
  errors = []
}: BulkDeleteDialogProps) {
  const [force, setForce] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const totalSize = worktrees.reduce((sum, worktree) => sum + (worktree.diskSize || 0), 0)
  const totalSizeKnown = worktrees.every((worktree) => worktree.diskSize !== null)
  const reviewCount = worktrees.filter((worktree) => worktree.safety.level !== 'safe').length
  const worktreeLabel = worktrees.length === 1 ? 'worktree' : 'worktrees'
  const armed = useRemovalConfirmationArm(worktrees.map((worktree) => worktree.id).join('\u0000'))
  const confirmationPhrase = removalConfirmationPhrase(worktrees.length)
  const confirmationValid = isRemovalConfirmationValid(confirmation, worktrees.length)

  return (
    <Dialog
      title={`Remove ${worktrees.length} ${worktreeLabel}?`}
      description={totalSizeKnown
        ? `${prettyBytes(totalSize)} is currently used by this selection.`
        : 'Disk usage is still being calculated for this selection.'}
      width="md"
      onClose={() => { if (!isPending) onClose() }}
      footer={(
        <>
          <button type="button" className="button-secondary" onClick={onClose} disabled={isPending} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={(event) => {
              if (!canInvokeRemoval({
                armed,
                confirmationValid,
                isTrusted: event.nativeEvent.isTrusted
              })) return
              onConfirm(force)
            }}
            disabled={isPending || worktrees.length === 0 || !armed || !confirmationValid}
          >
            <Trash2 aria-hidden="true" />
            {isPending ? 'Removing…' : `Remove ${worktrees.length}`}
          </button>
        </>
      )}
    >
      {reviewCount > 0 && (
        <div className="dialog-warning" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>{reviewCount} selected {reviewCount === 1 ? 'worktree needs' : 'worktrees need'} review.</span>
        </div>
      )}

      <div className="bulk-worktree-list" aria-label="Selected worktrees">
        {worktrees.map((worktree) => (
          <div key={worktree.id}>
            <span>
              <strong>{worktree.branch || 'detached HEAD'}</strong>
              <small>{worktree.repoName}</small>
            </span>
            <span className={`safety-text safety-${worktree.safety.level}`}>
              {worktree.safety.level === 'safe' ? 'Safe' : worktree.safety.level === 'caution' ? 'Review' : 'Unsafe'}
            </span>
            <code>{worktree.diskSize == null ? '—' : prettyBytes(worktree.diskSize)}</code>
          </div>
        ))}
      </div>

      <label className="dialog-checkbox">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => setForce(event.target.checked)}
          disabled={isPending}
        />
        <span>
          <strong>Force removal for the full selection</strong>
          <small>Use only after reviewing local changes and locked worktrees.</small>
        </span>
      </label>

      <label className="dialog-confirmation">
        <span>Type <code>{confirmationPhrase}</code> to confirm</span>
        <input
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={isPending}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${confirmationPhrase} to confirm removal of ${worktrees.length} worktrees`}
        />
      </label>

      {errors.length > 0 && (
        <div className="dialog-error" role="alert">
          <strong>{errors.length} {errors.length === 1 ? 'worktree was' : 'worktrees were'} not removed.</strong>
          <ul>
            {errors.map((failure) => (
              <li key={failure.path}>{failure.path}: {failure.error}</li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
