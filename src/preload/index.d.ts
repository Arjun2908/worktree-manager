import type { WorktreeAPI } from '../renderer/types'

declare global {
  interface Window {
    api: WorktreeAPI
  }
}
