import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export type AppTheme = 'dark' | 'light' | 'system'
export type WorktreeView = 'board' | 'table'

export interface AppSettings {
  settingsVersion: 2
  scanRoots: string[]
  theme: AppTheme
  showMainWorktrees: boolean
  defaultView: WorktreeView
  staleThresholdDays: number
}

export const SETTINGS_FILE = join(homedir(), '.config', 'worktree-manager', 'settings.json')

const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: 2,
  scanRoots: [join(homedir(), 'source')],
  theme: 'dark',
  showMainWorktrees: false,
  defaultView: 'board',
  staleThresholdDays: 30
}

function defaults(): AppSettings {
  return { ...DEFAULT_SETTINGS, scanRoots: [...DEFAULT_SETTINGS.scanRoots] }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light' || value === 'system'
}

function isThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365
}

function isWorktreeView(value: unknown): value is WorktreeView {
  return value === 'board' || value === 'table'
}

/**
 * Migrate persisted settings field-by-field. Invalid legacy values fall back to
 * defaults. Version 1 had a non-configurable table value, so it migrates to
 * the new board-first default; version 2 preserves an explicit user choice.
 */
export function normalizeLoadedSettings(value: unknown): AppSettings {
  const fallback = defaults()
  const settings = asRecord(value)
  if (!settings) return fallback

  return {
    settingsVersion: 2,
    scanRoots: Array.isArray(settings.scanRoots)
      ? settings.scanRoots.filter((root): root is string => typeof root === 'string' && root.length > 0)
      : fallback.scanRoots,
    theme: isTheme(settings.theme) ? settings.theme : fallback.theme,
    showMainWorktrees: typeof settings.showMainWorktrees === 'boolean'
      ? settings.showMainWorktrees
      : fallback.showMainWorktrees,
    defaultView: settings.settingsVersion === 2 && isWorktreeView(settings.defaultView)
      ? settings.defaultView
      : fallback.defaultView,
    staleThresholdDays: isThreshold(settings.staleThresholdDays)
      ? settings.staleThresholdDays
      : fallback.staleThresholdDays
  }
}

/** Strict validation for renderer writes. */
export function validateSettingsForSave(value: unknown): AppSettings {
  const settings = asRecord(value)
  if (!settings) throw new TypeError('Settings must be an object')
  if (!Array.isArray(settings.scanRoots)
    || !settings.scanRoots.every((root) => typeof root === 'string' && root.length > 0)) {
    throw new TypeError('scanRoots must be an array of non-empty strings')
  }
  if (!isTheme(settings.theme)) {
    throw new TypeError('theme must be dark, light, or system')
  }
  if (typeof settings.showMainWorktrees !== 'boolean') {
    throw new TypeError('showMainWorktrees must be a boolean')
  }
  if (!isThreshold(settings.staleThresholdDays)) {
    throw new TypeError('staleThresholdDays must be an integer from 1 to 365')
  }
  if (!isWorktreeView(settings.defaultView)) {
    throw new TypeError('defaultView must be board or table')
  }

  return {
    settingsVersion: 2,
    scanRoots: [...settings.scanRoots],
    theme: settings.theme,
    showMainWorktrees: settings.showMainWorktrees,
    defaultView: settings.defaultView,
    staleThresholdDays: settings.staleThresholdDays
  }
}

function writeSettings(settings: AppSettings, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, JSON.stringify(settings, null, 2))
  renameSync(temporaryPath, filePath)
}

export function loadSettings(filePath: string = SETTINGS_FILE): AppSettings {
  if (!existsSync(filePath)) return defaults()

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return defaults()
  }

  const normalized = normalizeLoadedSettings(parsed)
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    try {
      writeSettings(normalized, filePath)
    } catch {
      // Reading valid normalized settings should not fail because migration
      // could not be persisted (for example, a temporarily read-only file).
    }
  }
  return normalized
}

export function saveSettings(value: unknown, filePath: string = SETTINGS_FILE): AppSettings {
  const settings = validateSettingsForSave(value)
  writeSettings(settings, filePath)
  return settings
}
