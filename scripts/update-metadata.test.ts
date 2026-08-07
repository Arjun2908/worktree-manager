import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parse, stringify } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'worktree-manager-update-metadata-'))
  tempDirs.push(directory)
  const zipName = 'Worktree-Manager-1.0.0-universal.zip'
  await writeFile(join(directory, zipName), 'updater archive bytes')
  await writeFile(join(directory, `${zipName}.blockmap`), 'block map bytes')
  await writeFile(join(directory, 'obsolete.dmg.blockmap'), 'obsolete')
  await writeFile(join(directory, 'latest-mac.yml'), stringify({
    version: '0.0.0',
    path: 'obsolete.dmg',
    sha512: 'obsolete',
    files: []
  }))
  return directory
}

async function runScript(script: string, releaseDirectory: string): Promise<void> {
  await execFileAsync(process.execPath, [join(process.cwd(), 'scripts', script), releaseDirectory], {
    cwd: process.cwd()
  })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('macOS update metadata', () => {
  it('normalizes metadata to the updater ZIP and verifies every linked value', async () => {
    const directory = await fixtureDirectory()
    await runScript('normalize-update-metadata.mjs', directory)
    await runScript('verify-update-metadata.mjs', directory)

    const metadata = parse(await readFile(join(directory, 'latest-mac.yml'), 'utf8'))
    expect(metadata).toMatchObject({
      version: '1.0.0',
      path: 'Worktree-Manager-1.0.0-universal.zip',
      files: [{ url: 'Worktree-Manager-1.0.0-universal.zip' }]
    })
    await expect(access(join(directory, 'obsolete.dmg.blockmap'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('rejects an updater archive changed after metadata generation', async () => {
    const directory = await fixtureDirectory()
    await runScript('normalize-update-metadata.mjs', directory)
    await writeFile(
      join(directory, 'Worktree-Manager-1.0.0-universal.zip'),
      'tampered updater archive bytes'
    )

    await expect(runScript('verify-update-metadata.mjs', directory)).rejects.toMatchObject({
      stderr: expect.stringContaining('SHA-512 does not match')
    })
  })
})
