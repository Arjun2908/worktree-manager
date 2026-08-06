import { AlertTriangle, Archive, ChevronRight, FolderGit2, RefreshCw, ShieldCheck } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { useAppStore } from '../../stores/app-store'
import type { ScanResult, WorktreeStatus } from '../../types'

interface DashboardProps {
  scanResult: ScanResult | null
  isLoading: boolean
  isFetching?: boolean
  error?: Error | null
  onRetry: () => void
}

export function Dashboard({
  scanResult,
  isLoading,
  isFetching = false,
  error = null,
  onRetry
}: DashboardProps) {
  const { setCurrentView, setSelectedRepo, setStashRepo, setStatusFilter } = useAppStore()

  if ((isLoading || isFetching) && !scanResult) {
    return (
      <div className="flex h-48 items-center justify-center" role="status">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <span className="h-4 w-4 animate-spin rounded-full border border-border-strong border-t-primary" />
          Scanning repositories…
        </div>
      </div>
    )
  }

  if (error && !scanResult) {
    return (
      <div className="flex h-48 items-center justify-center px-6">
        <div className="max-w-lg rounded-lg border border-red-500/30 bg-red-500/[0.06] p-4 text-center" role="alert">
          <AlertTriangle
            className="mx-auto h-5 w-5"
            style={{ color: 'hsl(var(--semantic-danger))' }}
            aria-hidden="true"
          />
          <h2 className="mt-2 text-sm font-semibold text-text-primary">Couldn’t scan repositories</h2>
          <p className="mt-1 text-xs text-text-secondary">{error.message}</p>
          <button
            type="button"
            className="button-secondary mt-3"
            onClick={onRetry}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
            {isFetching ? 'Retrying…' : 'Retry scan'}
          </button>
        </div>
      </div>
    )
  }

  if (!scanResult) return null

  const nonMainWorktrees = scanResult.repos.flatMap((repo) =>
    repo.worktrees.filter((worktree) => !worktree.isMainWorktree)
  )
  const safeWorktrees = nonMainWorktrees.filter((worktree) => worktree.safety.level === 'safe')
  const attentionWorktrees = nonMainWorktrees.filter((worktree) => worktree.safety.level !== 'safe')
  const totalLinkedDisk = nonMainWorktrees.reduce((sum, worktree) => sum + (worktree.diskSize || 0), 0)
  const safeReclaimableDisk = safeWorktrees.reduce((sum, worktree) => sum + (worktree.diskSize || 0), 0)

  const repoRows = scanResult.repos
    .map((repo) => {
      const linkedWorktrees = repo.worktrees.filter((worktree) => !worktree.isMainWorktree)
      const safe = linkedWorktrees.filter((worktree) => worktree.safety.level === 'safe')
      return {
        ...repo,
        linkedCount: linkedWorktrees.length,
        safeCount: safe.length,
        linkedDisk: linkedWorktrees.reduce((sum, worktree) => sum + (worktree.diskSize || 0), 0),
        safeDisk: safe.reduce((sum, worktree) => sum + (worktree.diskSize || 0), 0)
      }
    })
    .filter((repo) => repo.linkedCount > 0)
    .sort((a, b) => b.safeDisk - a.safeDisk || b.linkedDisk - a.linkedDisk)

  const openWorktrees = (status: WorktreeStatus | 'all' | 'safe' | 'review' = 'all') => {
    setSelectedRepo(null)
    setStatusFilter(status)
    setCurrentView('worktrees')
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="inline-error" role="alert">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="block text-text-primary">Couldn’t refresh repositories.</strong>
            <span className="block">{error.message}</span>
          </span>
          <button
            type="button"
            className="button-secondary flex-shrink-0"
            onClick={onRetry}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
            {isFetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      <section aria-labelledby="cleanup-overview-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="cleanup-overview-heading" className="text-sm font-semibold text-text-primary">
              Cleanup overview
            </h2>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {nonMainWorktrees.length} linked worktree{nonMainWorktrees.length === 1 ? '' : 's'} occupy{' '}
              <span className="font-mono">{prettyBytes(totalLinkedDisk)}</span>. Only worktrees that pass every
              safety check are counted as reclaimable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openWorktrees('all')}
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-border-subtle bg-card md:grid-cols-3 md:divide-x md:divide-border-subtle">
          <button
            type="button"
            onClick={() => openWorktrees('safe')}
            className="flex min-h-24 items-start gap-3 border-b border-border-subtle p-4 text-left transition-colors hover:bg-surface-hover md:border-b-0"
          >
            <ShieldCheck
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: 'hsl(var(--semantic-safe))' }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text-primary">Safe cleanup</span>
              <span className="mt-1 block text-xl font-semibold text-text-primary">{safeWorktrees.length}</span>
              <span className="mt-0.5 block text-[11px] text-text-tertiary">
                <span className="font-mono">{prettyBytes(safeReclaimableDisk)}</span> reclaimable
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => openWorktrees('review')}
            className="flex min-h-24 items-start gap-3 border-b border-border-subtle p-4 text-left transition-colors hover:bg-surface-hover md:border-b-0"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: 'hsl(var(--semantic-caution))' }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text-primary">Needs review</span>
              <span className="mt-1 block text-xl font-semibold text-text-primary">{attentionWorktrees.length}</span>
              <span className="mt-0.5 block text-[11px] text-text-tertiary">
                Caution or unsafe · excluded from safe cleanup
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStashRepo(null)}
            disabled={scanResult.totalStashes === 0}
            className="flex min-h-24 items-start gap-3 p-4 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-70"
          >
            <Archive className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text-primary">Stashes</span>
              <span className="mt-1 block text-xl font-semibold text-text-primary">{scanResult.totalStashes}</span>
              <span className="mt-0.5 block text-[11px] text-text-tertiary">
                Review saved changes before removing them
              </span>
            </span>
          </button>
        </div>
      </section>

      <section aria-labelledby="repositories-overview-heading">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 id="repositories-overview-heading" className="text-sm font-semibold text-text-primary">
            Repositories
          </h2>
          <span className="text-[11px] text-text-tertiary">Sorted by safe reclaimable space</span>
        </div>

        {repoRows.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-card px-4 py-8 text-center">
            <FolderGit2 className="mx-auto h-5 w-5 text-text-tertiary" aria-hidden="true" />
            <p className="mt-2 text-sm text-text-secondary">No linked worktrees found.</p>
            <button
              type="button"
              onClick={() => setCurrentView('settings')}
              className="mt-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-hover"
            >
              Review scan directories
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-card">
            {repoRows.map((repo) => (
              <button
                type="button"
                key={repo.path}
                onClick={() => setSelectedRepo(repo.path)}
                className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-4 border-b border-border-subtle px-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <FolderGit2 className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-text-primary">{repo.name}</span>
                    <span className="block text-[11px] text-text-tertiary">
                      {repo.linkedCount} linked · {repo.safeCount} safe
                    </span>
                  </span>
                </span>

                <span className="text-right">
                  <span className="block font-mono text-xs text-text-secondary">
                    {prettyBytes(repo.linkedDisk)} total
                  </span>
                  <span
                    className="block font-mono text-[11px]"
                    style={{ color: repo.safeDisk > 0 ? 'hsl(var(--semantic-safe))' : 'hsl(var(--text-tertiary))' }}
                  >
                    {prettyBytes(repo.safeDisk)} safe
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-[11px] text-text-tertiary">
        Scanned {scanResult.repos.length} repositories in{' '}
        <span className="font-mono">{scanResult.scanDuration}ms</span>
      </p>
    </div>
  )
}
