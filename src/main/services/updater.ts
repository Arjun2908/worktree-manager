import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import {
  createUpdaterController,
  type AppUpdaterAdapter,
  type UpdatePhase,
  type UpdateStatus
} from './updater-controller'

export type { UpdatePhase, UpdateStatus }

const controller = createUpdaterController({
  updater: autoUpdater as unknown as AppUpdaterAdapter,
  getVersion: () => app.getVersion(),
  isPackaged: () => app.isPackaged,
  updatesDisabled: () =>
    process.env.WORKTREE_MANAGER_DISABLE_UPDATES === '1' ||
    process.argv.includes('--smoke-test'),
  getWindows: () => BrowserWindow.getAllWindows()
})

export function getUpdateStatus(): UpdateStatus {
  return controller.getStatus()
}

export function checkForAppUpdates(): Promise<UpdateStatus> {
  return controller.check()
}

export function downloadAppUpdate(): Promise<UpdateStatus> {
  return controller.download()
}

export function installAppUpdate(): void {
  controller.install()
}

export function initializeUpdater(): void {
  controller.initialize()
}
