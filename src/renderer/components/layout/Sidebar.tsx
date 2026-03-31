import { GitBranch, LayoutDashboard, FolderGit2, Archive } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores/app-store'
import { cn, getRepoColor } from '../../lib/utils'
import prettyBytes from 'pretty-bytes'
import type { RepoSummary } from '../../types'

interface SidebarProps {
  repos: RepoSummary[]
  totalWorktrees: number
  totalDiskUsage: number
  isLoading: boolean
}

export function Sidebar({ repos, totalWorktrees, totalDiskUsage, isLoading }: SidebarProps) {
  const { currentView, selectedRepo, setCurrentView, setSelectedRepo, setStashRepo } = useAppStore()

  const nonMainTotal = repos.reduce(
    (sum, r) => sum + r.worktrees.filter((w) => !w.isMainWorktree).length,
    0
  )
  const totalStashes = repos.reduce((sum, r) => sum + r.stashCount, 0)

  return (
    <div className="w-[260px] flex-shrink-0 glass border-r border-border flex flex-col h-full">
      {/* App title */}
      <div className="px-5 pt-2 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">Worktree Manager</h1>
            <p className="text-[10px] text-text-tertiary">Git workspace organizer</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="px-3 space-y-1">
        <button
          onClick={() => { setCurrentView('dashboard'); setSelectedRepo(null) }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
            currentView === 'dashboard' && !selectedRepo
              ? 'bg-primary/15 text-text-primary font-medium'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          )}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => { setCurrentView('worktrees'); setSelectedRepo(null) }}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
            currentView === 'worktrees' && !selectedRepo
              ? 'bg-primary/15 text-text-primary font-medium'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          )}
        >
          <FolderGit2 className="w-4 h-4" />
          All Worktrees
        </button>
        {totalStashes > 0 && (
          <button
            onClick={() => setStashRepo(null)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
              currentView === 'stashes'
                ? 'bg-primary/15 text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            )}
          >
            <Archive className="w-4 h-4" />
            Stashes
            <span className="ml-auto text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded font-mono">
              {totalStashes}
            </span>
          </button>
        )}
      </nav>

      {/* Repos section */}
      <div className="mt-6 flex-1 overflow-hidden flex flex-col">
        <div className="px-5 mb-2">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary font-medium">
            Repositories
          </span>
        </div>
        <div className="flex-1 overflow-auto px-3 space-y-0.5">
          {isLoading && repos.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="inline-block w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-text-tertiary mt-3">Scanning repos...</p>
            </div>
          ) : (
            repos.map((repo, i) => {
              const nonMainCount = repo.worktrees.filter(w => !w.isMainWorktree).length
              if (nonMainCount === 0) return null
              return (
                <motion.button
                  key={repo.path}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onClick={() => setSelectedRepo(repo.name)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-all duration-150',
                    selectedRepo === repo.name
                      ? 'bg-primary/15 text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getRepoColor(i) }}
                    />
                    <span className="truncate">{repo.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    {repo.stashCount > 0 && (
                      <span
                        className="text-[10px] text-orange-400 cursor-pointer hover:text-orange-300"
                        title={`${repo.stashCount} stash${repo.stashCount > 1 ? 'es' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setStashRepo(repo.path) }}
                      >
                        {repo.stashCount}s
                      </span>
                    )}
                    <span className="text-xs text-text-tertiary bg-surface px-1.5 py-0.5 rounded">
                      {nonMainCount}
                    </span>
                  </span>
                </motion.button>
              )
            })
          )}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>{nonMainTotal} worktrees</span>
          <span>{prettyBytes(totalDiskUsage)}</span>
        </div>
      </div>
    </div>
  )
}
