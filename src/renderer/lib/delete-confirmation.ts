export const REMOVAL_ARM_DELAY_MS = 750

export function removalConfirmationPhrase(worktreeCount: number): string {
  return worktreeCount === 1 ? 'remove' : `remove ${worktreeCount}`
}

export function isRemovalConfirmationValid(value: string, worktreeCount: number): boolean {
  return value.trim().toLowerCase() === removalConfirmationPhrase(worktreeCount)
}

interface RemovalInvocation {
  armed: boolean
  confirmationValid: boolean
  isTrusted: boolean
}

export function canInvokeRemoval({
  armed,
  confirmationValid,
  isTrusted
}: RemovalInvocation): boolean {
  return armed && confirmationValid && isTrusted
}
