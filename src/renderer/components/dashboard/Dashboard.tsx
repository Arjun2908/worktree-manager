import { GitBranch, HardDrive, Clock, Trash2, ShieldCheck, Archive } from 'lucide-react'
import { motion } from 'framer-motion'
import prettyBytes from 'pretty-bytes'
import { useAppStore } from '../../stores/app-store'
import { getRepoColor } from '../../lib/utils'
import type { ScanResult } from '../../types'

interface DashboardProps {
  scanResult: ScanResult | null
  isLoading: boolean
}

export function Dashboard({ scanResult, isLoading }: DashboardProps) {
  const { setSelectedRepo } = useAppStore()

  if (isLoading && !scanResult) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-text-tertiary mt-4">Scanning repositories...</p>
        </div>
      </div>
    )
  }

  if (!scanResult) return null

  const allWorktrees = scanResult.repos.flatMap((r) => r.worktrees)
  const nonMainWorktrees = allWorktrees.filter((w) => !w.isMainWorktree)
  const staleCount = nonMainWorktrees.filter((w) => w.statuses.includes('stale')).length
  const prunableCount = nonMainWorktrees.filter((w) => w.statuses.includes('prunable') || w.statuses.includes('orphan')).length
  const safeToDeleteCount = nonMainWorktrees.filter((w) => w.safety.level === 'safe').length
  const nonMainDisk = nonMainWorktrees.reduce((sum, w) => sum + (w.diskSize || 0), 0)
  const stashRepoCount = scanResult.repos.filter((r) => r.stashCount > 0).length

  const stats = [
    {
      label: 'Worktrees',
      value: nonMainWorktrees.length,
      subtitle: `across ${scanResult.repos.length} repos`,
      icon: GitBranch,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500'
    },
    {
      label: 'Disk Usage',
      value: prettyBytes(nonMainDisk),
      subtitle: 'recoverable space',
      icon: HardDrive,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-500'
    },
    {
      label: 'Stale',
      value: staleCount,
      subtitle: 'unused 30+ days',
      icon: Clock,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500'
    },
    {
      label: 'Prunable',
      value: prunableCount,
      subtitle: 'safe to remove',
      icon: Trash2,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-500'
    },
    {
      label: 'Safe to Delete',
      value: safeToDeleteCount,
      subtitle: 'merged or pushed & clean',
      icon: ShieldCheck,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500'
    },
    {
      label: 'Stashes',
      value: scanResult.totalStashes,
      subtitle: stashRepoCount > 0 ? `across ${stashRepoCount} repo${stashRepoCount > 1 ? 's' : ''}` : 'none found',
      icon: Archive,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-500'
    }
  ]

  const chartRepos = scanResult.repos
    .map((r) => ({
      ...r,
      nonMainCount: r.worktrees.filter((w) => !w.isMainWorktree).length,
      nonMainDisk: r.worktrees.filter((w) => !w.isMainWorktree).reduce((s, w) => s + (w.diskSize || 0), 0)
    }))
    .filter((r) => r.nonMainCount > 0)
    .sort((a, b) => b.nonMainCount - a.nonMainCount)

  const maxCount = Math.max(...chartRepos.map((r) => r.nonMainCount), 1)

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="bg-card border border-border rounded-xl p-5 hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{stat.label}</p>
                <p className="text-3xl font-bold text-text-primary mt-1">{stat.value}</p>
                <p className="text-xs text-text-faint mt-1">{stat.subtitle}</p>
              </div>
              <div className={`${stat.iconBg} rounded-lg p-2.5`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Disk usage breakdown */}
      {nonMainDisk > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold text-text-primary mb-4">Disk Usage by Repository</h3>
          <div className="h-6 rounded-full overflow-hidden flex bg-surface">
            {chartRepos.map((repo, i) => {
              const pct = (repo.nonMainDisk / nonMainDisk) * 100
              if (pct < 1) return null
              return (
                <motion.div
                  key={repo.path}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                  className="h-full relative group cursor-pointer"
                  style={{ backgroundColor: getRepoColor(i) }}
                  onClick={() => setSelectedRepo(repo.name)}
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                </motion.div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {chartRepos.map((repo, i) => (
              <button
                key={repo.path}
                onClick={() => setSelectedRepo(repo.name)}
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getRepoColor(i) }} />
                <span>{repo.name}</span>
                <span className="text-text-faint">{prettyBytes(repo.nonMainDisk)}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Repo ranking */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="bg-card border border-border rounded-xl p-5"
      >
        <h3 className="text-sm font-semibold text-text-primary mb-4">Repositories by Worktree Count</h3>
        <div className="space-y-3">
          {chartRepos.map((repo, i) => (
            <motion.button
              key={repo.path}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.04, duration: 0.25 }}
              onClick={() => setSelectedRepo(repo.name)}
              className="w-full flex items-center gap-4 group hover:bg-surface-hover rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            >
              <span className="text-sm text-text-secondary w-36 text-left truncate group-hover:text-text-primary transition-colors">
                {repo.name}
              </span>
              <div className="flex-1 bg-surface rounded-full h-2.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(repo.nonMainCount / maxCount) * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.04, duration: 0.5, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                />
              </div>
              <span className="text-xs font-mono text-text-secondary w-8 text-right">{repo.nonMainCount}</span>
              <span className="text-xs text-text-faint w-16 text-right">{prettyBytes(repo.nonMainDisk)}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Scan info */}
      <p className="text-xs text-text-faint text-center">
        Scanned {scanResult.repos.length} repositories in {scanResult.scanDuration}ms
      </p>
    </div>
  )
}
