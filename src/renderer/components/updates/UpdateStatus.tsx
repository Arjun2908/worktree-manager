import {
  AlertCircle,
  Check,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw
} from 'lucide-react'
import { useUpdateStatus } from '../../hooks/useUpdateStatus'

const actionClass =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60'

export function UpdateStatus() {
  const { status, isActing, check, download, install } = useUpdateStatus()

  if (!status) return null

  if (status.phase === 'available') {
    return (
      <button
        type="button"
        disabled={isActing}
        onClick={() => void download()}
        className={`${actionClass} bg-primary/10 text-primary hover:bg-primary/15`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          Update to {status.availableVersion || 'latest'}
        </span>
      </button>
    )
  }

  if (status.phase === 'downloading') {
    const percent = Math.round(status.progress?.percent || 0)
    return (
      <div className="px-2 py-1.5 text-[11px] text-text-secondary" role="status" aria-live="polite">
        <div className="mb-1.5 flex items-center gap-2">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span className="flex-1">Downloading update</span>
          <span className="font-mono text-text-tertiary">{percent}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-active">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  if (status.phase === 'ready') {
    return (
      <button
        type="button"
        disabled={isActing}
        onClick={() => void install()}
        className={`${actionClass} bg-primary text-white hover:bg-primary/90`}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Restart to update
      </button>
    )
  }

  if (status.phase === 'error') {
    return (
      <button
        type="button"
        disabled={isActing}
        onClick={() => void check()}
        title={status.message}
        className={`${actionClass} text-danger hover:bg-danger/10`}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Update check failed</span>
        <span className="text-text-tertiary">Retry</span>
      </button>
    )
  }

  const checking = status.phase === 'checking' || isActing
  const unavailable = status.phase === 'unavailable'

  return (
    <button
      type="button"
      disabled={checking || unavailable}
      onClick={() => void check()}
      title={unavailable ? status.message : 'Check for updates'}
      className={`${actionClass} text-text-tertiary hover:bg-surface-hover hover:text-text-secondary`}
    >
      {checking ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : status.phase === 'up-to-date' ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="flex-1">
        {checking ? 'Checking for updates' : `Version ${status.currentVersion}`}
      </span>
      {status.phase === 'up-to-date' && <span>Current</span>}
    </button>
  )
}
