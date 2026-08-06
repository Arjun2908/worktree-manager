import { execFile } from 'child_process'
import { mkdtemp, realpath, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterEach, describe, expect, it } from 'vitest'
import { getSafetyStatus } from './git'
import { findGitRepos, scanWorktrees } from './scanner'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'worktree-manager-test-'))
  tempDirs.push(path)
  return path
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd })
}

async function initializeRepo(path: string): Promise<void> {
  await git(path, 'init', '--initial-branch=main')
  await git(path, 'config', 'user.email', 'worktree-manager@example.test')
  await git(path, 'config', 'user.name', 'Worktree Manager Test')
  await writeFile(join(path, 'README.md'), 'initial\n')
  await git(path, 'add', 'README.md')
  await git(path, 'commit', '-m', 'Initial commit')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('repository discovery', () => {
  it('recurses and deduplicates linked worktrees by their common Git directory', async () => {
    const root = await makeTempDir()
    const repoPath = join(root, 'nested', 'deeper', 'project')
    await execFileAsync('mkdir', ['-p', repoPath])
    await initializeRepo(repoPath)
    const linkedPath = join(root, 'linked-project')
    await git(repoPath, 'worktree', 'add', '-b', 'linked-test', linkedPath)

    const repos = await findGitRepos([root, join(root, 'nested'), linkedPath])

    expect(repos).toHaveLength(1)
    expect(repos[0].path).toBe(await realpath(repoPath))
  })
})

describe('safety status', () => {
  it('does not call a clean branch safe when its upstream lacks local commits', async () => {
    const root = await makeTempDir()
    const remotePath = join(root, 'remote.git')
    const repoPath = join(root, 'repo')
    await execFileAsync('mkdir', ['-p', remotePath, repoPath])
    await git(remotePath, 'init', '--bare', '--initial-branch=main')
    await initializeRepo(repoPath)
    await git(repoPath, 'remote', 'add', 'origin', remotePath)
    await git(repoPath, 'push', '-u', 'origin', 'main')
    await git(repoPath, 'switch', '-c', 'feature')
    await writeFile(join(repoPath, 'feature.txt'), 'first\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'First feature commit')
    await git(repoPath, 'push', '-u', 'origin', 'feature')
    await writeFile(join(repoPath, 'feature.txt'), 'first\nsecond\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'Unpushed feature commit')

    const beforePush = await getSafetyStatus(repoPath, repoPath, 'feature', 'main')
    expect(beforePush.level).toBe('danger')
    expect(beforePush.reasons).toContain('unpushed commits')

    await git(repoPath, 'push')
    const afterPush = await getSafetyStatus(repoPath, repoPath, 'feature', 'main')
    expect(afterPush.level).toBe('safe')
  })

  it('marks a dirty detached worktree dangerous while keeping a clean one cautionary', async () => {
    const root = await makeTempDir()
    const repoPath = join(root, 'repo')
    await execFileAsync('mkdir', ['-p', repoPath])
    await initializeRepo(repoPath)
    await git(repoPath, 'switch', '--detach', 'HEAD')

    const clean = await getSafetyStatus(repoPath, repoPath, null, 'main')
    expect(clean.level).toBe('caution')
    expect(clean.reasons).toContain('clean working tree')

    await writeFile(join(repoPath, 'uncommitted.txt'), 'do not lose this\n')
    const dirty = await getSafetyStatus(repoPath, repoPath, null, 'main')
    expect(dirty.level).toBe('danger')
    expect(dirty.reasons.some((reason) => reason.includes('uncommitted change'))).toBe(true)
  })
})

describe('scan coordination', () => {
  it('publishes core worktree data without waiting for disk hydration', async () => {
    const root = await makeTempDir()
    const repoPath = join(root, 'repo')
    const linkedPath = join(root, 'linked')
    await execFileAsync('mkdir', ['-p', repoPath])
    await initializeRepo(repoPath)
    await git(repoPath, 'worktree', 'add', '-b', 'linked-test', linkedPath)

    const result = await scanWorktrees([root], undefined, 30)
    const canonicalLinkedPath = await realpath(linkedPath)
    const linked = result.repos[0].worktrees.find((worktree) => worktree.path === canonicalLinkedPath)

    expect(linked).toMatchObject({ branch: 'linked-test', diskSize: null })
    expect(result.repos[0].totalDiskSize).toBe(0)
    expect(result.totalDiskUsage).toBe(0)
  })

  it('coalesces identical in-flight scans', async () => {
    const root = await makeTempDir()
    const first = scanWorktrees([root], undefined, 30)
    const second = scanWorktrees([root], undefined, 30)

    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({ repos: [], totalWorktrees: 0 })
  })

  it('reports completed repositories instead of repositories merely started', async () => {
    const root = await makeTempDir()
    const firstRepo = join(root, 'first')
    const secondRepo = join(root, 'second')
    await execFileAsync('mkdir', ['-p', firstRepo, secondRepo])
    await initializeRepo(firstRepo)
    await initializeRepo(secondRepo)
    const progress: Array<{ current: number; total: number; repo: string }> = []

    await scanWorktrees([root], (update) => progress.push(update), 30)

    expect(progress[0]).toEqual({ current: 0, total: 2, repo: '' })
    expect(progress.map((update) => update.current)).toEqual([0, 1, 2])
    expect(new Set(progress.slice(1).map((update) => update.repo))).toEqual(
      new Set(['first', 'second'])
    )
  })
})
