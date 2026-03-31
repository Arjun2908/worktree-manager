import { useState, useCallback } from 'react'

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

  const selectAll = useCallback((ids: string[]) => {
    setSelected(new Set(ids))
  }, [])

  const deselectAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  return {
    selected,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    count: selected.size
  }
}
