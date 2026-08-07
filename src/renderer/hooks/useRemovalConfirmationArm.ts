import { useLayoutEffect, useRef, useState } from 'react'
import { REMOVAL_ARM_DELAY_MS } from '../lib/delete-confirmation'

interface HotModuleApi {
  on: (event: 'vite:beforeUpdate', callback: () => void) => void
  off: (event: 'vite:beforeUpdate', callback: () => void) => void
}

export function useRemovalConfirmationArm(scope: string): boolean {
  const [armed, setArmed] = useState(false)
  const armedScope = useRef<string | null>(null)
  const armTimer = useRef<number | null>(null)

  const isArmedForCurrentRender = armed
    && armedScope.current === scope

  useLayoutEffect(() => {
    armedScope.current = scope
    const hot = (import.meta as ImportMeta & { hot?: HotModuleApi }).hot
    // Keep a newly mounted or hot-reloaded destructive surface outside the
    // click-through window before it can accept a trusted confirmation.
    const scheduleArm = () => {
      setArmed(false)
      if (armTimer.current != null) window.clearTimeout(armTimer.current)
      armTimer.current = window.setTimeout(() => setArmed(true), REMOVAL_ARM_DELAY_MS)
    }

    scheduleArm()
    hot?.on('vite:beforeUpdate', scheduleArm)

    return () => {
      if (armTimer.current != null) window.clearTimeout(armTimer.current)
      hot?.off('vite:beforeUpdate', scheduleArm)
    }
  }, [scope])

  return isArmedForCurrentRender
}
