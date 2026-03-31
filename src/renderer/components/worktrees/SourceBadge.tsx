import { GitBranch, Sparkles, MousePointer2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { WorktreeSource } from '../../types'

const sourceConfig: Record<WorktreeSource, { label: string; icon: typeof GitBranch; className: string }> = {
  git: {
    label: 'Git',
    icon: GitBranch,
    className: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  },
  claude: {
    label: 'Claude',
    icon: Sparkles,
    className: 'bg-amber-500/10 text-amber-300 border-amber-500/20'
  },
  cursor: {
    label: 'Cursor',
    icon: MousePointer2,
    className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
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
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border',
      config.className,
      className
    )}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}
