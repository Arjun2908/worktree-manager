import { Tooltip } from '../ui/Tooltip'

interface DivergenceBadgeProps {
  ahead: number
  behind: number
  focusable?: boolean
}

export function DivergenceBadge({ ahead, behind, focusable = true }: DivergenceBadgeProps) {
  if (ahead === 0 && behind === 0) {
    return <span className="text-[11px] font-mono text-text-tertiary">in sync</span>
  }

  const parts: string[] = []
  if (ahead > 0) parts.push(`${ahead} commit${ahead > 1 ? 's' : ''} ahead`)
  if (behind > 0) parts.push(`${behind} commit${behind > 1 ? 's' : ''} behind`)

  return (
    <Tooltip text={parts.join(', ')}>
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[11px]"
        aria-label={parts.join(', ')}
        tabIndex={focusable ? 0 : undefined}
      >
        {ahead > 0 && (
          <span style={{ color: 'hsl(var(--semantic-safe))' }} aria-hidden="true">
            <span className="opacity-75">&uarr;</span>{ahead}
          </span>
        )}
        {behind > 0 && (
          <span style={{ color: 'hsl(var(--semantic-caution))' }} aria-hidden="true">
            <span className="opacity-75">&darr;</span>{behind}
          </span>
        )}
      </span>
    </Tooltip>
  )
}
