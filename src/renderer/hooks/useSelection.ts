import { useState, useCallback, useMemo } from 'react'
import {
  countSelectedIds,
  reconcileSelectedIds,
  replaceSelectedIds
} from '../lib/selection'

export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: Iterable<string>) => {
    setSelected((current) => replaceSelectedIds(current, ids))
  }, [])

  const deselectAll = useCallback(() => {
    setSelected((current) => current.size === 0 ? current : new Set())
  }, [])

  const reconcile = useCallback((validIds: Iterable<string>) => {
    setSelected((current) => reconcileSelectedIds(current, validIds))
  }, [])

  const countSelected = useCallback(
    (ids: Iterable<string>) => countSelectedIds(selected, ids),
    [selected]
  )

  return useMemo(() => ({
    selected,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    reconcile,
    countSelected,
    count: selected.size
  }), [selected, isSelected, toggle, selectAll, deselectAll, reconcile, countSelected])
}
