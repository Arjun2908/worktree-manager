import { describe, expect, it } from 'vitest'
import {
  canInvokeRemoval,
  isRemovalConfirmationValid,
  REMOVAL_ARM_DELAY_MS,
  removalConfirmationPhrase
} from './delete-confirmation'

describe('removal confirmation', () => {
  it('requires an explicit word for a single worktree', () => {
    expect(removalConfirmationPhrase(1)).toBe('remove')
    expect(isRemovalConfirmationValid('', 1)).toBe(false)
    expect(isRemovalConfirmationValid('remove', 1)).toBe(true)
    expect(isRemovalConfirmationValid(' REMOVE ', 1)).toBe(true)
  })

  it('includes the exact selection count for bulk removal', () => {
    expect(removalConfirmationPhrase(3)).toBe('remove 3')
    expect(isRemovalConfirmationValid('remove', 3)).toBe(false)
    expect(isRemovalConfirmationValid('remove 2', 3)).toBe(false)
    expect(isRemovalConfirmationValid('remove 3', 3)).toBe(true)
  })

  it('requires an armed dialog and a trusted user activation', () => {
    expect(REMOVAL_ARM_DELAY_MS).toBe(750)
    expect(canInvokeRemoval({ armed: false, confirmationValid: true, isTrusted: true })).toBe(false)
    expect(canInvokeRemoval({ armed: true, confirmationValid: false, isTrusted: true })).toBe(false)
    expect(canInvokeRemoval({ armed: true, confirmationValid: true, isTrusted: false })).toBe(false)
    expect(canInvokeRemoval({ armed: true, confirmationValid: true, isTrusted: true })).toBe(true)
  })
})
