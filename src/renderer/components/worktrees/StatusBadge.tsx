import { cn } from '../../lib/utils'
import type { WorktreeStatus } from '../../types'

const statusConfig: Record<WorktreeStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'status-active'
  },
  stale: {
    label: 'Stale',
    className: 'status-stale'
  },
  locked: {
    label: 'Locked',
    className: 'status-locked'
  },
  prunable: {
    label: 'Prunable',
    className: 'status-prunable'
  },
  detached: {
    label: 'Detached',
    className: 'status-detached'
  },
  orphan: {
    label: 'Orphan',
    className: 'status-orphan'
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
      'status-badge',
      config.className
    )}>
      {config.label}
    </span>
  )
}
