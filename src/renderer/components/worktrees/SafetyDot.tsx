import { Tooltip } from '../ui/Tooltip'
import type { SafetyLevel } from '../../types'

const dotColors: Record<SafetyLevel, string> = {
  safe: 'bg-emerald-500 shadow-emerald-500/40',
  caution: 'bg-amber-500 shadow-amber-500/40',
  danger: 'bg-red-500 shadow-red-500/40'
}

const labels: Record<SafetyLevel, string> = {
  safe: 'Safe to delete',
  caution: 'Use caution',
  danger: 'Not safe to delete'
}

interface SafetyDotProps {
  level: SafetyLevel
  reasons: string[]
  size?: 'sm' | 'md'
}

export function SafetyDot({ level, reasons, size = 'sm' }: SafetyDotProps) {
  const tooltipText = `${labels[level]}: ${reasons.join(', ')}`
  const px = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'

  return (
    <Tooltip text={tooltipText}>
      <span
        className={`inline-block rounded-full shadow-sm ${px} ${dotColors[level]}`}
        aria-label={tooltipText}
      />
    </Tooltip>
  )
}
