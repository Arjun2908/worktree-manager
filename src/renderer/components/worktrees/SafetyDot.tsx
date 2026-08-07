import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import type { SafetyLevel } from '../../types'

const levelClasses: Record<SafetyLevel, string> = {
  safe: 'safety-safe',
  caution: 'safety-caution',
  danger: 'safety-danger'
}

const labels: Record<SafetyLevel, string> = {
  safe: 'Safe',
  caution: 'Review',
  danger: 'Unsafe'
}

interface SafetyDotProps {
  level: SafetyLevel
  reasons: string[]
  size?: 'sm' | 'md'
}

export function SafetyDot({ level, reasons, size = 'sm' }: SafetyDotProps) {
  const reasonText = reasons.length > 0 ? reasons.join(', ') : 'No additional details'
  const tooltipText = `${labels[level]}: ${reasonText}`
  const Icon = level === 'safe' ? ShieldCheck : AlertTriangle
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <Tooltip text={tooltipText}>
      <span
        className={`safety-indicator ${levelClasses[level]}`}
        aria-label={tooltipText}
        tabIndex={0}
      >
        <Icon className={iconSize} aria-hidden="true" />
        <span>{labels[level]}</span>
      </span>
    </Tooltip>
  )
}
