import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadSettings,
  saveSettings,
  validateSettingsForSave
} from './settings'

const tempDirs: string[] = []

async function settingsPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'worktree-manager-settings-'))
  tempDirs.push(root)
  return join(root, 'settings.json')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('settings migration', () => {
  it('normalizes invalid legacy fields and migrates to the board-first settings schema', async () => {
    const filePath = await settingsPath()
    await writeFile(filePath, JSON.stringify({
      scanRoots: ['/source', 42],
      theme: 'sepia',
      showMainWorktrees: 'yes',
      defaultView: 'card',
      staleThresholdDays: 999
    }))

    const settings = loadSettings(filePath)
    expect(settings).toMatchObject({
      settingsVersion: 2,
      scanRoots: ['/source'],
      theme: 'dark',
      showMainWorktrees: false,
      defaultView: 'board',
      staleThresholdDays: 30
    })
    expect(JSON.parse(await readFile(filePath, 'utf-8'))).toEqual(settings)
  })
})

describe('settings save validation', () => {
  const valid = {
    settingsVersion: 2 as const,
    scanRoots: ['/source'],
    theme: 'system',
    showMainWorktrees: true,
    defaultView: 'table' as const,
    staleThresholdDays: 45
  }

  it('accepts and preserves an explicit board or table preference', async () => {
    const filePath = await settingsPath()
    const saved = saveSettings(valid, filePath)
    expect(saved.defaultView).toBe('table')
    expect(loadSettings(filePath)).toEqual(saved)

    const board = saveSettings({ ...valid, defaultView: 'board' }, filePath)
    expect(board.defaultView).toBe('board')
    expect(loadSettings(filePath)).toEqual(board)
  })

  it.each([
    [{ ...valid, scanRoots: ['/source', 1] }, 'scanRoots'],
    [{ ...valid, scanRoots: [''] }, 'scanRoots'],
    [{ ...valid, theme: 'sepia' }, 'theme'],
    [{ ...valid, showMainWorktrees: 1 }, 'showMainWorktrees'],
    [{ ...valid, defaultView: 'card' }, 'defaultView'],
    [{ ...valid, staleThresholdDays: 0 }, 'staleThresholdDays'],
    [{ ...valid, staleThresholdDays: 366 }, 'staleThresholdDays'],
    [{ ...valid, staleThresholdDays: 1.5 }, 'staleThresholdDays']
  ])('rejects an invalid save payload', (settings, field) => {
    expect(() => validateSettingsForSave(settings)).toThrow(field)
  })
})
