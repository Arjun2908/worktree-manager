import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '../types'

interface UseUpdateStatusResult {
  status: UpdateStatus | null
  isActing: boolean
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
}

export function useUpdateStatus(): UseUpdateStatusResult {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [isActing, setIsActing] = useState(false)

  useEffect(() => {
    let active = true
    const unsubscribe = window.api.onUpdateStatus((nextStatus) => {
      if (active) setStatus(nextStatus)
    })
    void window.api.getUpdateStatus().then((currentStatus) => {
      if (active) setStatus(currentStatus)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (action: () => Promise<UpdateStatus | void>) => {
    setIsActing(true)
    try {
      const nextStatus = await action()
      if (nextStatus) setStatus(nextStatus)
    } finally {
      setIsActing(false)
    }
  }, [])

  const check = useCallback(() => run(() => window.api.checkForUpdates()), [run])
  const download = useCallback(() => run(() => window.api.downloadUpdate()), [run])
  const install = useCallback(() => run(() => window.api.installUpdate()), [run])

  return { status, isActing, check, download, install }
}
