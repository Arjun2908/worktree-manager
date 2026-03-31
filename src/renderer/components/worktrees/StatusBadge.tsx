import { cn } from '../../lib/utils'
import type { WorktreeStatus } from '../../types'

const statusConfig: Record<WorktreeStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  },
  stale: {
    label: 'Stale',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  },
  locked: {
    label: 'Locked',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  },
  prunable: {
    label: 'Prunable',
    className: 'bg-red-500/10 text-red-400 border-red-500/20'
  },
  detached: {
    label: 'Detached',
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
  },
  orphan: {
    label: 'Orphan',
    className: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  }
}

interface StatusBadgeProps {
  status: WorktreeStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
      config.className
    )}>
      {config.label}
    </span>
  )
}
