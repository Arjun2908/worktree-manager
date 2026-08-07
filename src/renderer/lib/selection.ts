/** Returns the current Set when it already contains exactly the requested IDs. */
export function replaceSelectedIds(current: Set<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(Array.from(ids))
  if (next.size === current.size && Array.from(next).every((id) => current.has(id))) {
    return current
  }
  return next
}

/** Drops IDs that no longer exist while preserving identity when nothing changed. */
export function reconcileSelectedIds(
  current: Set<string>,
  validIds: Iterable<string>
): Set<string> {
  if (current.size === 0) return current

  const valid = validIds instanceof Set ? validIds : new Set(Array.from(validIds))
  const next = new Set(Array.from(current).filter((id) => valid.has(id)))
  return next.size === current.size ? current : next
}

export function countSelectedIds(selected: ReadonlySet<string>, ids: Iterable<string>): number {
  let count = 0
  Array.from(ids).forEach((id) => {
    if (selected.has(id)) count++
  })
  return count
}
