import { Archive, FolderGit2, LayoutDashboard, Settings } from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import { useAppStore } from '../../stores/app-store'
import { cn } from '../../lib/utils'
import type { RepoSummary } from '../../types'
import { UpdateStatus } from '../updates/UpdateStatus'

interface SidebarProps {
  repos: RepoSummary[]
  totalWorktrees: number
  totalDiskUsage: number
  isLoading: boolean
}

const navigationRow =
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors'

export function Sidebar({ repos, totalDiskUsage, isLoading }: SidebarProps) {
  const { currentView, selectedRepo, setCurrentView, setSelectedRepo, setStashRepo } = useAppStore()

  const nonMainTotal = repos.reduce(
    (sum, repo) => sum + repo.worktrees.filter((worktree) => !worktree.isMainWorktree).length,
    0
  )
  const totalStashes = repos.reduce((sum, repo) => sum + repo.stashCount, 0)
  const diskUsageKnown = repos.every((repo) => repo.worktrees.every(
    (worktree) => worktree.isMainWorktree || worktree.diskSize !== null
  ))

  return (
    <aside className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-border-subtle bg-background/75">
      <nav aria-label="Primary" className="space-y-0.5 px-3 pt-2">
        <button
          type="button"
          onClick={() => {
            setCurrentView('dashboard')
            setSelectedRepo(null)
          }}
          aria-current={currentView === 'dashboard' ? 'page' : undefined}
          className={cn(
            navigationRow,
            currentView === 'dashboard'
              ? 'bg-surface-active text-text-primary font-medium'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
          Overview
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentView('worktrees')
            setSelectedRepo(null)
          }}
          aria-current={currentView === 'worktrees' && !selectedRepo ? 'page' : undefined}
          className={cn(
            navigationRow,
            currentView === 'worktrees' && !selectedRepo
              ? 'bg-surface-active text-text-primary font-medium'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          <FolderGit2 className="h-3.5 w-3.5" aria-hidden="true" />
          All Worktrees
          <span className="ml-auto font-mono text-[11px] text-text-tertiary">{nonMainTotal}</span>
        </button>

        {totalStashes > 0 && (
          <button
            type="button"
            onClick={() => setStashRepo(null)}
            aria-current={currentView === 'stashes' ? 'page' : undefined}
            className={cn(
              navigationRow,
              currentView === 'stashes'
                ? 'bg-surface-active text-text-primary font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            Stashes
            <span className="ml-auto font-mono text-[11px] text-text-tertiary">{totalStashes}</span>
          </button>
        )}
      </nav>

      <section aria-labelledby="repositories-heading" className="mt-5 flex min-h-0 flex-1 flex-col">
        <h2
          id="repositories-heading"
          className="mb-1 px-5 text-[11px] font-medium text-text-tertiary"
        >
          Repositories
        </h2>

        <div className="flex-1 space-y-0.5 overflow-auto px-3">
          {isLoading && repos.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-text-tertiary" role="status">
              <span className="h-3 w-3 animate-spin rounded-full border border-border-strong border-t-primary" />
              Scanning repositories…
            </div>
          ) : repos.length === 0 ? (
            <p className="px-2 py-3 text-xs text-text-tertiary">No repositories found.</p>
          ) : (
            repos.map((repo) => {
              const nonMainCount = repo.worktrees.filter((worktree) => !worktree.isMainWorktree).length
              if (nonMainCount === 0) return null

              const isSelected = currentView === 'worktrees' && selectedRepo === repo.path

              return (
                <div
                  key={repo.path}
                  className={cn(
                    'group flex min-h-8 items-center rounded-md transition-colors',
                    isSelected
                      ? 'bg-surface-active text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRepo(repo.path)}
                    aria-current={isSelected ? 'page' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-md px-2 text-left"
                  >
                    <FolderGit2 className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{repo.name}</span>
                    <span className="font-mono text-[11px] text-text-tertiary">{nonMainCount}</span>
                  </button>

                  {repo.stashCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setStashRepo(repo.path)}
                      aria-label={`View ${repo.stashCount} stash${repo.stashCount === 1 ? '' : 'es'} in ${repo.name}`}
                      className="mr-1 flex min-h-7 items-center gap-1 rounded px-1.5 text-[11px] text-text-tertiary hover:bg-surface-active hover:text-text-primary"
                    >
                      <Archive className="h-3 w-3" aria-hidden="true" />
                      <span className="font-mono">{repo.stashCount}</span>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </section>

      <div className="border-t border-border-subtle px-3 py-3">
        <UpdateStatus />

        <button
          type="button"
          onClick={() => setCurrentView('settings')}
          aria-current={currentView === 'settings' ? 'page' : undefined}
          className={cn(
            navigationRow,
            currentView === 'settings'
              ? 'bg-surface-active text-text-primary font-medium'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          Settings
        </button>

        <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-text-tertiary">
          <span>{nonMainTotal} linked</span>
          <span className="font-mono">{diskUsageKnown ? prettyBytes(totalDiskUsage) : '—'}</span>
        </div>
      </div>
    </aside>
  )
}
