import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'
import {
  developmentRendererUrl,
  isTrustedRendererUrl
} from './renderer-security'
import { initializeUpdater } from './services/updater'

let mainWindow: BrowserWindow | null = null
const smokeTestMode = process.argv.includes('--smoke-test')
let smokeTestFinished = false

function finishSmokeTest(success: boolean, message: string): void {
  if (!smokeTestMode || smokeTestFinished) return
  smokeTestFinished = true
  process.exitCode = success ? 0 : 1
  console.log(message)
  setTimeout(() => app.quit(), 50).unref()
}

function configureSessionSecurity(): void {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  const productionPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!app.isPackaged) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [productionPolicy]
      }
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'sidebar',
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, {
      isPackaged: app.isPackaged,
      developmentUrl: process.env.ELECTRON_RENDERER_URL,
      packagedRendererDirectory: join(__dirname, '../renderer')
    })) event.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    if (!smokeTestMode) mainWindow?.show()
  })

  if (smokeTestMode) {
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      finishSmokeTest(
        false,
        `WORKTREE_MANAGER_SMOKE_TEST_FAILED ${errorCode}: ${errorDescription}`
      )
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Load the renderer
  const rendererUrl = developmentRendererUrl(
    app.isPackaged,
    process.env.ELECTRON_RENDERER_URL
  )
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  configureSessionSecurity()
  registerIpcHandlers(() => {
    finishSmokeTest(true, 'WORKTREE_MANAGER_SMOKE_TEST_OK')
  })
  createWindow()
  initializeUpdater()

  if (smokeTestMode) {
    const smokeTimeout = setTimeout(() => {
      finishSmokeTest(false, 'WORKTREE_MANAGER_SMOKE_TEST_FAILED timed out loading the renderer')
    }, 20_000)
    smokeTimeout.unref()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
