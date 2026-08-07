import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import {
  createUpdaterController,
  type AppUpdaterAdapter
} from './updater-controller'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  allowPrerelease = true
  logger: unknown = null
  checkForUpdates = vi.fn<() => Promise<unknown>>().mockResolvedValue(null)
  downloadUpdate = vi.fn<() => Promise<unknown>>().mockResolvedValue([])
  quitAndInstall = vi.fn<(isSilent: boolean, isForceRunAfter: boolean) => void>()
}

function info(version: string, releaseName?: string): UpdateInfo {
  return { version, releaseName } as UpdateInfo
}

function progress(overrides: Partial<ProgressInfo> = {}): ProgressInfo {
  return {
    percent: 37.5,
    transferred: 375,
    total: 1000,
    bytesPerSecond: 125,
    delta: 125,
    ...overrides
  }
}

function setup(options: { packaged?: boolean; disabled?: boolean } = {}) {
  const updater = new FakeUpdater()
  const send = vi.fn()
  const controller = createUpdaterController({
    updater: updater as unknown as AppUpdaterAdapter,
    getVersion: () => '1.0.0',
    isPackaged: () => options.packaged ?? true,
    updatesDisabled: () => options.disabled ?? false,
    getWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
    now: () => new Date('2026-08-06T12:34:56.000Z')
  })
  return { controller, updater, send }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('updater lifecycle', () => {
  it('moves from available through download progress to ready and install', async () => {
    const { controller, updater, send } = setup()
    controller.initialize()

    expect(controller.getStatus()).toEqual({ phase: 'idle', currentVersion: '1.0.0' })
    expect(updater).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: false
    })

    updater.emit('update-available', info('1.1.0', 'Faster worktree scans'))
    expect(controller.getStatus()).toMatchObject({
      phase: 'available',
      currentVersion: '1.0.0',
      availableVersion: '1.1.0',
      releaseName: 'Faster worktree scans',
      checkedAt: '2026-08-06T12:34:56.000Z'
    })

    await controller.download()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(controller.getStatus()).toMatchObject({
      phase: 'downloading',
      progress: { percent: 0 }
    })

    updater.emit('download-progress', progress({ percent: 140 }))
    expect(controller.getStatus()).toMatchObject({
      phase: 'downloading',
      availableVersion: '1.1.0',
      progress: { percent: 100, transferred: 375, total: 1000 }
    })

    updater.emit('update-downloaded', info('1.1.0', 'Faster worktree scans'))
    expect(controller.getStatus()).toMatchObject({
      phase: 'ready',
      availableVersion: '1.1.0',
      progress: { percent: 100 }
    })

    controller.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(send).toHaveBeenCalledWith('update:status', expect.any(Object))
    controller.dispose()
  })

  it('surfaces redacted check and download errors and can recover to up-to-date', async () => {
    const { controller, updater } = setup()
    controller.initialize()

    updater.checkForUpdates.mockRejectedValueOnce(
      new Error('authorization=github-secret&request=failed')
    )
    await controller.check()
    expect(controller.getStatus()).toMatchObject({
      phase: 'error',
      message: 'authorization=[redacted]&request=failed'
    })

    updater.emit('update-not-available', info('1.0.0'))
    expect(controller.getStatus()).toMatchObject({
      phase: 'up-to-date',
      availableVersion: '1.0.0',
      checkedAt: '2026-08-06T12:34:56.000Z'
    })

    updater.emit('update-available', info('1.1.0'))
    updater.downloadUpdate.mockRejectedValueOnce(new Error('token ghp_secret'))
    await controller.download()
    expect(controller.getStatus()).toMatchObject({
      phase: 'error',
      availableVersion: '1.1.0',
      message: 'token=[redacted]'
    })
    expect(() => controller.install()).toThrow('has not finished downloading')
    controller.dispose()
  })

  it.each([
    [{ packaged: false }, 'Updates are available in signed production builds.'],
    [{ packaged: true, disabled: true }, 'Automatic update checks are disabled for this launch.']
  ])('stays unavailable when production updates cannot run', async (options, message) => {
    const { controller, updater } = setup(options)
    controller.initialize()

    expect(controller.getStatus()).toEqual({
      phase: 'unavailable',
      currentVersion: '1.0.0',
      message
    })
    await controller.check()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.listenerCount('update-available')).toBe(0)
    controller.dispose()
  })
})
