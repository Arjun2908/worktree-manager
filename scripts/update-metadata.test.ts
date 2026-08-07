import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parse, stringify } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

type UpdateFixture = {
  directory: string
  packageVersion: string
  zipName: string
}

async function fixtureDirectory(artifactVersion?: string): Promise<UpdateFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'worktree-manager-update-metadata-'))
  tempDirs.push(directory)
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))
  const packageVersion = packageJson.version as string
  const zipName = `Worktree-Manager-${artifactVersion ?? packageVersion}-universal.zip`
  await writeFile(join(directory, zipName), 'updater archive bytes')
  await writeFile(join(directory, `${zipName}.blockmap`), 'block map bytes')
  await writeFile(join(directory, 'obsolete.dmg.blockmap'), 'obsolete')
  await writeFile(join(directory, 'latest-mac.yml'), stringify({
    version: '0.0.0',
    path: 'obsolete.dmg',
    sha512: 'obsolete',
    files: []
  }))
  return { directory, packageVersion, zipName }
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
    const { directory, packageVersion, zipName } = await fixtureDirectory()
    await runScript('normalize-update-metadata.mjs', directory)
    await runScript('verify-update-metadata.mjs', directory)

    const metadata = parse(await readFile(join(directory, 'latest-mac.yml'), 'utf8'))
    expect(metadata).toMatchObject({
      version: packageVersion,
      path: zipName,
      files: [{ url: zipName }]
    })
    await expect(access(join(directory, 'obsolete.dmg.blockmap'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('rejects an updater archive changed after metadata generation', async () => {
    const { directory, zipName } = await fixtureDirectory()
    await runScript('normalize-update-metadata.mjs', directory)
    await writeFile(join(directory, zipName), 'tampered updater archive bytes')

    await expect(runScript('verify-update-metadata.mjs', directory)).rejects.toMatchObject({
      stderr: expect.stringContaining('SHA-512 does not match')
    })
  })

  it('rejects an updater archive whose filename has the wrong version', async () => {
    const { directory, packageVersion } = await fixtureDirectory('999.0.0')
    await runScript('normalize-update-metadata.mjs', directory)

    await expect(runScript('verify-update-metadata.mjs', directory)).rejects.toMatchObject({
      stderr: expect.stringContaining(`does not match package version ${packageVersion}`)
    })
  })
})
