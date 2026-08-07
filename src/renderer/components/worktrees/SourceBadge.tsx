import { GitBranch, Sparkles, MousePointer2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { WorktreeSource } from '../../types'

const sourceConfig: Record<WorktreeSource, { label: string; icon: typeof GitBranch; className: string }> = {
  git: {
    label: 'Git',
    icon: GitBranch,
    className: ''
  },
  claude: {
    label: 'Claude',
    icon: Sparkles,
    className: ''
  },
  cursor: {
    label: 'Cursor',
    icon: MousePointer2,
    className: ''
  }
}

interface SourceBadgeProps {
  source: WorktreeSource
  className?: string
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const config = sourceConfig[source]
  const Icon = config.icon

  return (
    <span className={cn(
      'source-badge',
      config.className,
      className
    )}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {config.label}
    </span>
  )
}
