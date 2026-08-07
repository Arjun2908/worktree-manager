import { execFile } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dropStash,
  dropStashesBefore,
  dropStashesByOid,
  listStashes
} from './git'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'worktree-manager-stash-'))
  tempDirs.push(root)
  const repoPath = join(root, 'repo')
  await mkdir(repoPath)
  await git(repoPath, 'init', '--initial-branch=main')
  await git(repoPath, 'config', 'user.email', 'worktree-manager@example.test')
  await git(repoPath, 'config', 'user.name', 'Worktree Manager Test')
  await writeFile(join(repoPath, 'tracked.txt'), 'initial\n')
  await git(repoPath, 'add', 'tracked.txt')
  await git(repoPath, 'commit', '-m', 'Initial commit')
  return repoPath
}

async function createStash(repoPath: string, label: string): Promise<void> {
  await writeFile(join(repoPath, 'tracked.txt'), `${label}\n`)
  await git(repoPath, 'stash', 'push', '-m', label)
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('stable stash identity', () => {
  it('drops the requested OID after a newer stash shifts its numeric index', async () => {
    const repoPath = await makeRepo()
    await createStash(repoPath, 'first')
    const first = (await listStashes(repoPath))[0]
    expect(first.oid).toMatch(/^[0-9a-f]{40,64}$/)

    await createStash(repoPath, 'inserted later')
    const beforeDrop = await listStashes(repoPath)
    const inserted = beforeDrop[0]
    expect(beforeDrop.find((stash) => stash.oid === first.oid)?.index).toBe(1)

    await dropStash(repoPath, first.oid)
    const remaining = await listStashes(repoPath)
    expect(remaining.map((stash) => stash.oid)).toEqual([inserted.oid])
    await expect(dropStash(repoPath, first.oid)).rejects.toThrow('no longer exists')
  })

  it('returns one result per originally eligible stash in original order', async () => {
    const repoPath = await makeRepo()
    await createStash(repoPath, 'first')
    await createStash(repoPath, 'second')
    const originals = await listStashes(repoPath)

    const results = await dropStashesBefore(
      repoPath,
      new Date(Date.now() + 60_000).toISOString()
    )

    expect(results.map((result) => result.oid)).toEqual(originals.map((stash) => stash.oid))
    expect(results.every((result) => result.success)).toBe(true)
    expect(await listStashes(repoPath)).toEqual([])
  })

  it('preserves partial failures instead of reducing them to a count', async () => {
    const firstOid = 'a'.repeat(40)
    const secondOid = 'b'.repeat(40)
    const results = await dropStashesByOid(
      '/repo',
      [firstOid, secondOid],
      async (_, oid) => {
        if (oid === secondOid) throw new Error('identity disappeared')
      }
    )

    expect(results).toEqual([
      { oid: firstOid, success: true },
      { oid: secondOid, success: false, error: 'identity disappeared' }
    ])
  })
})
