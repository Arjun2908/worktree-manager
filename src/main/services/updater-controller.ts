import type { ProgressInfo, UpdateInfo } from 'electron-updater'

export type UpdatePhase =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  availableVersion?: string
  releaseName?: string
  progress?: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }
  message?: string
  checkedAt?: string
}

type UpdaterEventListeners = {
  'checking-for-update': () => void
  'update-available': (info: UpdateInfo) => void
  'update-not-available': (info: UpdateInfo) => void
  'download-progress': (progress: ProgressInfo) => void
  'update-downloaded': (info: UpdateInfo) => void
  error: (error: Error) => void
}

export interface AppUpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  logger: unknown
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: (isSilent: boolean, isForceRunAfter: boolean) => void
  on: <Event extends keyof UpdaterEventListeners>(
    event: Event,
    listener: UpdaterEventListeners[Event]
  ) => unknown
}

interface UpdateWindow {
  isDestroyed: () => boolean
  webContents: {
    send: (channel: string, status: UpdateStatus) => void
  }
}

export interface UpdaterControllerDependencies {
  updater: AppUpdaterAdapter
  getVersion: () => string
  isPackaged: () => boolean
  updatesDisabled: () => boolean
  getWindows: () => UpdateWindow[]
  now?: () => Date
  initialCheckDelayMs?: number
  checkIntervalMs?: number
}

export interface UpdaterController {
  initialize: () => void
  getStatus: () => UpdateStatus
  check: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  install: () => void
  dispose: () => void
}

const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const DEFAULT_INITIAL_CHECK_DELAY_MS = 12_000

function releaseName(info: UpdateInfo): string | undefined {
  return typeof info.releaseName === 'string' ? info.releaseName : undefined
}

function errorMessage(error: Error | string): string {
  const rawMessage = typeof error === 'string' ? error : error.message
  return rawMessage.replace(
    /(token|password|authorization)(?:\s*[:=]\s*|\s+)[^&\r\n]*/gi,
    '$1=[redacted]'
  )
}

export function createUpdaterController(
  dependencies: UpdaterControllerDependencies
): UpdaterController {
  const {
    updater,
    getVersion,
    isPackaged,
    updatesDisabled,
    getWindows,
    now = () => new Date(),
    initialCheckDelayMs = DEFAULT_INITIAL_CHECK_DELAY_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS
  } = dependencies

  let initialized = false
  let enabled = false
  let initialTimer: NodeJS.Timeout | null = null
  let checkTimer: NodeJS.Timeout | null = null
  let status: UpdateStatus = {
    phase: 'unavailable',
    currentVersion: getVersion(),
    message: 'Updates are available in signed production builds.'
  }

  function updateStatus(next: UpdateStatus): void {
    status = next
    for (const window of getWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('update:status', status)
      }
    }
  }

  function baseStatus(phase: UpdatePhase): UpdateStatus {
    return { phase, currentVersion: getVersion() }
  }

  function getStatus(): UpdateStatus {
    return { ...status, progress: status.progress ? { ...status.progress } : undefined }
  }

  function progressStatus(progress: ProgressInfo): UpdateStatus {
    return {
      ...baseStatus('downloading'),
      availableVersion: status.availableVersion,
      releaseName: status.releaseName,
      progress: {
        percent: Math.max(0, Math.min(100, progress.percent)),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    }
  }

  function scheduleNextCheck(): void {
    if (checkTimer) clearTimeout(checkTimer)
    checkTimer = setTimeout(() => {
      void check().finally(scheduleNextCheck)
    }, checkIntervalMs)
    checkTimer.unref()
  }

  async function check(): Promise<UpdateStatus> {
    if (!initialized || !enabled || !isPackaged()) return getStatus()
    if (status.phase === 'downloading' || status.phase === 'ready') return getStatus()

    updateStatus(baseStatus('checking'))
    try {
      await updater.checkForUpdates()
    } catch (error) {
      updateStatus({
        ...baseStatus('error'),
        message: errorMessage(error instanceof Error ? error : String(error))
      })
    }
    return getStatus()
  }

  async function download(): Promise<UpdateStatus> {
    if (status.phase !== 'available') {
      throw new Error('No update is ready to download')
    }

    const availableVersion = status.availableVersion
    const availableReleaseName = status.releaseName
    updateStatus({
      ...baseStatus('downloading'),
      availableVersion,
      releaseName: availableReleaseName,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
    })
    try {
      await updater.downloadUpdate()
    } catch (error) {
      updateStatus({
        ...baseStatus('error'),
        availableVersion,
        releaseName: availableReleaseName,
        message: errorMessage(error instanceof Error ? error : String(error))
      })
    }
    return getStatus()
  }

  function install(): void {
    if (status.phase !== 'ready') {
      throw new Error('The update has not finished downloading')
    }
    updater.quitAndInstall(false, true)
  }

  function initialize(): void {
    if (initialized) return
    initialized = true

    if (!isPackaged() || updatesDisabled()) {
      updateStatus({
        ...baseStatus('unavailable'),
        message: isPackaged()
          ? 'Automatic update checks are disabled for this launch.'
          : 'Updates are available in signed production builds.'
      })
      return
    }

    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.logger = console
    enabled = true
    updateStatus(baseStatus('idle'))

    updater.on('checking-for-update', () => {
      updateStatus(baseStatus('checking'))
    })
    updater.on('update-available', (info) => {
      updateStatus({
        ...baseStatus('available'),
        availableVersion: info.version,
        releaseName: releaseName(info),
        checkedAt: now().toISOString()
      })
    })
    updater.on('update-not-available', (info) => {
      updateStatus({
        ...baseStatus('up-to-date'),
        availableVersion: info.version,
        checkedAt: now().toISOString()
      })
    })
    updater.on('download-progress', (progress) => {
      updateStatus(progressStatus(progress))
    })
    updater.on('update-downloaded', (info) => {
      updateStatus({
        ...baseStatus('ready'),
        availableVersion: info.version,
        releaseName: releaseName(info),
        progress: status.progress ? { ...status.progress, percent: 100 } : undefined
      })
    })
    updater.on('error', (error) => {
      updateStatus({
        ...baseStatus('error'),
        availableVersion: status.availableVersion,
        releaseName: status.releaseName,
        message: errorMessage(error)
      })
    })

    initialTimer = setTimeout(() => {
      void check().finally(scheduleNextCheck)
    }, initialCheckDelayMs)
    initialTimer.unref()
  }

  function dispose(): void {
    if (initialTimer) clearTimeout(initialTimer)
    if (checkTimer) clearTimeout(checkTimer)
    initialTimer = null
    checkTimer = null
  }

  return { initialize, getStatus, check, download, install, dispose }
}
