import type { ReactNode } from 'react'

interface TooltipProps {
  text: string
  children: ReactNode
  position?: 'above' | 'below'
}

export function Tooltip({ text, children, position = 'above' }: TooltipProps) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <span className={position === 'below' ? 'tooltip-text tooltip-below' : 'tooltip-text'}>{text}</span>
    </div>
  )
}
