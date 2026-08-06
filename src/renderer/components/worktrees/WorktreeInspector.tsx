import { useState } from 'react'
import {
  AlertTriangle,
  Code,
  Copy,
  ExternalLink,
  FolderOpen,
  Lock,
  MousePointer2,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import prettyBytes from 'pretty-bytes'
import { SourceBadge } from './SourceBadge'
import { StatusBadge } from './StatusBadge'
import type { Worktree } from '../../types'
import type { WorktreeOperations } from './worktree-browser-types'

interface WorktreeInspectorProps {
  worktree: Worktree
  operations: WorktreeOperations
  onClose: () => void
}

const safetyLabels = {
  safe: 'Safe to remove',
  caution: 'Review before removal',
  danger: 'Local work at risk'
} as const

export function WorktreeInspector({ worktree, operations, onClose }: WorktreeInspectorProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const lockPending = operations.pendingLockPaths.has(worktree.path)
  const updated = worktree.lastModified
    ? formatDistanceToNow(new Date(worktree.lastModified), { addSuffix: true })
    : 'Unknown'
  const SafetyIcon = worktree.safety.level === 'safe' ? ShieldCheck : AlertTriangle

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(worktree.path)
      setCopyStatus('Path copied')
    } catch {
      setCopyStatus('Path could not be copied')
    }
  }

  return (
    <aside className="worktree-inspector" aria-label="Worktree details">
      <header className="inspector-header">
        <div>
          <h2 title={worktree.branch || 'Detached HEAD'}>{worktree.branch || 'Detached HEAD'}</h2>
          <p><SourceBadge source={worktree.source} /> · {worktree.commitHash || 'No commit hash'}</p>
        </div>
        <button type="button" className="toolbar-icon-button" onClick={onClose} aria-label="Close worktree details">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="inspector-scroll">
        <section aria-labelledby="inspector-overview-heading" className="inspector-section">
          <h3 id="inspector-overview-heading">Overview</h3>
          <dl className="inspector-facts">
            <div>
              <dt>Path</dt>
              <dd className="inspector-path">
                <code title={worktree.path}>{worktree.path}</code>
                <button type="button" onClick={() => void copyPath()} aria-label="Copy worktree path">
                  <Copy aria-hidden="true" />
                </button>
              </dd>
            </div>
            <div><dt>Repository</dt><dd>{worktree.repoName}</dd></div>
            <div><dt>Branch</dt><dd>{worktree.branch || 'Detached HEAD'}</dd></div>
            <div>
              <dt>Status</dt>
              <dd className={`inspector-safety-text safety-${worktree.isMainWorktree ? 'protected' : worktree.safety.level}`}>
                {worktree.isMainWorktree ? 'Protected' : safetyLabels[worktree.safety.level]}
              </dd>
            </div>
            <div>
              <dt>Pull request</dt>
              <dd>
                {worktree.prInfo ? (
                  <button type="button" className="inspector-link" onClick={() => void window.api.openUrl(worktree.prInfo!.url)}>
                    #{worktree.prInfo.number} {worktree.prInfo.state.toLowerCase()}
                    <ExternalLink aria-hidden="true" />
                  </button>
                ) : 'None found'}
              </dd>
            </div>
            <div><dt>Updated</dt><dd>{updated}</dd></div>
            <div><dt>Size</dt><dd>{worktree.diskSize == null ? 'Unknown' : prettyBytes(worktree.diskSize)}</dd></div>
            <div><dt>Locked</dt><dd>{worktree.locked ? 'Yes' : 'No'}</dd></div>
          </dl>
          <p className="sr-only" role="status" aria-live="polite">{copyStatus}</p>
        </section>

        {worktree.summary && (
          <section aria-labelledby="inspector-summary-heading" className="inspector-section">
            <h3 id="inspector-summary-heading">Work summary</h3>
            <p className="inspector-summary">{worktree.summary}</p>
          </section>
        )}

        <section aria-labelledby="inspector-safety-heading" className="inspector-section">
          <h3 id="inspector-safety-heading">Safety assessment</h3>
          <div className={`inspector-safety-card safety-${worktree.isMainWorktree ? 'protected' : worktree.safety.level}`}>
            <SafetyIcon aria-hidden="true" />
            <div>
              <strong>{worktree.isMainWorktree ? 'Protected checkout' : safetyLabels[worktree.safety.level]}</strong>
              {worktree.isMainWorktree ? (
                <p>Main checkouts cannot be removed from Worktree Manager.</p>
              ) : worktree.safety.reasons.length > 0 ? (
                <ul>
                  {worktree.safety.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              ) : (
                <p>No additional safety details are available.</p>
              )}
            </div>
          </div>

          {worktree.statuses.length > 0 && (
            <div className="inspector-statuses" aria-label="Worktree statuses">
              {worktree.statuses.map((status) => <StatusBadge key={status} status={status} />)}
            </div>
          )}
        </section>

        <section aria-labelledby="inspector-actions-heading" className="inspector-section inspector-actions">
          <h3 id="inspector-actions-heading">Actions</h3>
          <button type="button" onClick={() => void window.api.openInFinder(worktree.path)}>
            <FolderOpen aria-hidden="true" /> Open in Finder
          </button>
          <button type="button" onClick={() => void window.api.openInTerminal(worktree.path)}>
            <Terminal aria-hidden="true" /> Open in Terminal
          </button>
          <button type="button" onClick={() => void window.api.openInEditor(worktree.path, 'code')}>
            <Code aria-hidden="true" /> Open in VS Code
          </button>
          <button type="button" onClick={() => void window.api.openInEditor(worktree.path, 'cursor')}>
            <MousePointer2 aria-hidden="true" /> Open in Cursor
          </button>
          {worktree.prInfo && (
            <button type="button" onClick={() => void window.api.openUrl(worktree.prInfo!.url)}>
              <ExternalLink aria-hidden="true" /> Open pull request
            </button>
          )}
          {!worktree.isMainWorktree && (
            <>
              <button
                type="button"
                disabled={lockPending}
                aria-busy={lockPending}
                onClick={() => void operations.changeLock(worktree, !worktree.locked)}
              >
                {worktree.locked ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
                {lockPending
                  ? worktree.locked ? 'Unlocking…' : 'Locking…'
                  : worktree.locked ? 'Unlock worktree' : 'Lock worktree'}
              </button>
              <button type="button" className="inspector-delete" onClick={() => operations.requestDelete(worktree)}>
                <Trash2 aria-hidden="true" /> Remove worktree…
              </button>
            </>
          )}
        </section>
      </div>
    </aside>
  )
}
