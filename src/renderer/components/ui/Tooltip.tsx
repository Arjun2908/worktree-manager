import { cloneElement, useId, type ReactElement } from 'react'

interface TooltipProps {
  text: string
  children: ReactElement<{ 'aria-describedby'?: string }>
  position?: 'above' | 'below'
}

export function Tooltip({ text, children, position = 'above' }: TooltipProps) {
  const tooltipId = useId()
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ')

  return (
    <div className="tooltip-wrapper">
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span
        id={tooltipId}
        role="tooltip"
        className={position === 'below' ? 'tooltip-text tooltip-below' : 'tooltip-text'}
      >
        {text}
      </span>
    </div>
  )
}
