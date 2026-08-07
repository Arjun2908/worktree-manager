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

interface DeleteDialogProps {
  worktree: Worktree
  onClose: () => void
  onConfirm: (force: boolean) => void
  isPending?: boolean
  error?: string | null
}

export function DeleteDialog({
  worktree,
  onClose,
  onConfirm,
  isPending = false,
  error = null
}: DeleteDialogProps) {
  const [force, setForce] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const displayPath = worktree.path.replace(/^\/Users\/[^/]+/, '~')
  const armed = useRemovalConfirmationArm(worktree.id)
  const confirmationPhrase = removalConfirmationPhrase(1)
  const confirmationValid = isRemovalConfirmationValid(confirmation, 1)

  return (
    <Dialog
      title={`Remove ${worktree.branch || 'detached worktree'}?`}
      description="The worktree directory will be removed. Commits on the branch are not deleted."
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
            disabled={isPending || !armed || !confirmationValid}
          >
            <Trash2 aria-hidden="true" />
            {isPending ? 'Removing…' : 'Remove worktree'}
          </button>
        </>
      )}
    >
      <div className="dialog-summary">
        <div>
          <span>Repository</span>
          <strong>{worktree.repoName}</strong>
        </div>
        <div>
          <span>Path</span>
          <code title={worktree.path}>{displayPath}</code>
        </div>
        <div>
          <span>Size</span>
          <strong>{worktree.diskSize == null ? 'Unknown' : prettyBytes(worktree.diskSize)}</strong>
        </div>
      </div>

      {worktree.safety.level !== 'safe' && (
        <div className="dialog-warning" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>{worktree.safety.reasons.join(', ') || 'This worktree needs review before removal.'}</span>
        </div>
      )}

      <label className="dialog-checkbox">
        <input
          type="checkbox"
          checked={force}
          onChange={(event) => setForce(event.target.checked)}
          disabled={isPending}
        />
        <span>
          <strong>Force removal</strong>
          <small>Required when the worktree has local changes or is locked.</small>
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
          aria-label={`Type ${confirmationPhrase} to confirm worktree removal`}
        />
      </label>

      {error && <p className="dialog-error" role="alert">{error}</p>}
    </Dialog>
  )
}
