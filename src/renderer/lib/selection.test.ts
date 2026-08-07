import { describe, expect, it } from 'vitest'
import { countSelectedIds, reconcileSelectedIds, replaceSelectedIds } from './selection'

describe('selection helpers', () => {
  it('replaces the selection without churning identity when the IDs are unchanged', () => {
    const current = new Set(['a', 'b'])

    expect(replaceSelectedIds(current, ['b', 'a'])).toBe(current)
    expect(Array.from(replaceSelectedIds(current, ['b', 'c']))).toEqual(['b', 'c'])
  })

  it('drops IDs that disappeared after a cache refresh', () => {
    const current = new Set(['visible', 'deleted', 'hidden'])

    expect(Array.from(reconcileSelectedIds(current, ['visible', 'hidden']))).toEqual(['visible', 'hidden'])
    expect(reconcileSelectedIds(current, current)).toBe(current)
  })

  it('counts only selected IDs in the visible scope', () => {
    expect(countSelectedIds(new Set(['a', 'b', 'hidden']), ['a', 'c'])).toBe(1)
  })
})
