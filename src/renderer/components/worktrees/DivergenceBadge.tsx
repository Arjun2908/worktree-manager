import { Tooltip } from '../ui/Tooltip'

interface DivergenceBadgeProps {
  ahead: number
  behind: number
}

export function DivergenceBadge({ ahead, behind }: DivergenceBadgeProps) {
  if (ahead === 0 && behind === 0) {
    return <span className="text-[11px] font-mono text-text-faint">in sync</span>
  }

  const parts: string[] = []
  if (ahead > 0) parts.push(`${ahead} commit${ahead > 1 ? 's' : ''} ahead`)
  if (behind > 0) parts.push(`${behind} commit${behind > 1 ? 's' : ''} behind`)

  return (
    <Tooltip text={parts.join(', ')}>
      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
        {ahead > 0 && (
          <span className="text-emerald-400">
            <span className="opacity-60">&uarr;</span>{ahead}
          </span>
        )}
        {behind > 0 && (
          <span className="text-amber-400">
            <span className="opacity-60">&darr;</span>{behind}
          </span>
        )}
      </span>
    </Tooltip>
  )
}
