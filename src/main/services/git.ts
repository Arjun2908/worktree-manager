import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface ParsedWorktree {
  path: string
  head: string
  branch: string | null
  detached: boolean
  locked: boolean
  prunable: boolean
}

export async function listWorktrees(repoPath: string): Promise<ParsedWorktree[]> {
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      timeout: 10000
    })

    const worktrees: ParsedWorktree[] = []
    const blocks = stdout.trim().split('\n\n')

    for (const block of blocks) {
      if (!block.trim()) continue
      const lines = block.trim().split('\n')
      const wt: ParsedWorktree = {
        path: '',
        head: '',
        branch: null,
        detached: false,
        locked: false,
        prunable: false
      }

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wt.path = line.slice('worktree '.length)
        } else if (line.startsWith('HEAD ')) {
          wt.head = line.slice('HEAD '.length)
        } else if (line.startsWith('branch ')) {
          wt.branch = line.slice('branch '.length).replace('refs/heads/', '')
        } else if (line === 'detached') {
          wt.detached = true
        } else if (line.startsWith('locked')) {
          wt.locked = true
        } else if (line.startsWith('prunable')) {
          wt.prunable = true
        }
      }

      if (wt.path) {
        worktrees.push(wt)
      }
    }

    return worktrees
  } catch {
    return []
  }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  force: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['worktree', 'remove', worktreePath]
    if (force) args.push('--force')

    await execFileAsync('git', args, { cwd: repoPath, timeout: 30000 })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.stderr || err.message }
  }
}

export async function pruneWorktrees(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'prune', '--verbose'], {
      cwd: repoPath,
      timeout: 10000
    })
    return stdout
      .split('\n')
      .filter((line) => line.trim())
  } catch {
    return []
  }
}

export async function lockWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await execFileAsync('git', ['worktree', 'lock', worktreePath], {
    cwd: repoPath,
    timeout: 5000
  })
}

export async function unlockWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await execFileAsync('git', ['worktree', 'unlock', worktreePath], {
    cwd: repoPath,
    timeout: 5000
  })
}

/**
 * Get the GitHub repo URL (owner/repo) from a git remote.
 * Returns null if no GitHub remote found.
 */
export async function getGitHubRepo(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoPath,
      timeout: 5000
    })
    const url = stdout.trim()
    // Match github.com/owner/repo from HTTPS or SSH URLs
    const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
    if (match) return `${match[1]}/${match[2]}`
    return null
  } catch {
    return null
  }
}

/**
 * Use `gh` CLI to find a PR for a specific branch.
 * Returns { number, url, title, state } or null.
 */
export async function findPRForBranch(
  repoPath: string,
  branch: string
): Promise<{ number: number; url: string; title: string; state: string } | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--head', branch, '--json', 'number,url,title,state', '--limit', '1'],
      { cwd: repoPath, timeout: 10000 }
    )
    const prs = JSON.parse(stdout)
    if (prs.length > 0) return prs[0]
    return null
  } catch {
    return null
  }
}

/**
 * Batch-fetch PR info for multiple branches in a repo.
 * Returns a map of branch -> PR info.
 */
export async function findPRsForBranches(
  repoPath: string,
  branches: string[]
): Promise<Record<string, { number: number; url: string; title: string; state: string }>> {
  const results: Record<string, { number: number; url: string; title: string; state: string }> = {}

  // Use gh pr list to get all open PRs at once, then match by branch
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--json', 'number,url,title,state,headRefName', '--limit', '100', '--state', 'all'],
      { cwd: repoPath, timeout: 15000 }
    )
    const prs = JSON.parse(stdout)
    const branchSet = new Set(branches)
    for (const pr of prs) {
      if (branchSet.has(pr.headRefName)) {
        results[pr.headRefName] = {
          number: pr.number,
          url: pr.url,
          title: pr.title,
          state: pr.state
        }
      }
    }
  } catch {
    // gh CLI not installed or not authenticated - silently skip
  }

  return results
}

// ─── New Phase 1 features ───────────────────────────────────────────

/**
 * Resolve the default branch name (main, master, etc.)
 */
async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
      cwd: repoPath, timeout: 3000
    })
    return stdout.trim().replace('refs/remotes/origin/', '')
  } catch {
    // Fallback: check if main or master exists
    for (const name of ['main', 'master']) {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', name], { cwd: repoPath, timeout: 2000 })
        return name
      } catch { /* try next */ }
    }
    return 'main'
  }
}

/**
 * Generate a one-line work summary from recent commit messages unique to this branch.
 */
export async function getWorkSummary(
  repoPath: string,
  worktreePath: string,
  branch: string | null
): Promise<string> {
  try {
    if (!branch) {
      // Detached HEAD — just show recent commits from the worktree
      const { stdout } = await execFileAsync('git', ['log', '--oneline', '-3'], {
        cwd: worktreePath, timeout: 3000
      })
      const lines = stdout.trim().split('\n').filter(Boolean)
      return lines.map((l) => l.replace(/^[a-f0-9]+ /, '')).slice(0, 2).join(' · ')
    }

    const defaultBranch = await getDefaultBranch(repoPath)
    const { stdout } = await execFileAsync(
      'git', ['log', '--oneline', `-5`, `${defaultBranch}..${branch}`],
      { cwd: repoPath, timeout: 3000 }
    )
    const lines = stdout.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return ''
    return lines.map((l) => l.replace(/^[a-f0-9]+ /, '')).slice(0, 3).join(' · ')
  } catch {
    return ''
  }
}

export type SafetyLevel = 'safe' | 'caution' | 'danger'

export interface SafetyStatus {
  level: SafetyLevel
  reasons: string[]
}

/**
 * Determine how safe it is to delete a worktree.
 * Green (safe): merged OR (clean AND pushed)
 * Yellow (caution): not merged but pushed to remote
 * Red (danger): uncommitted changes OR local-only unpushed branch
 */
export async function getSafetyStatus(
  repoPath: string,
  worktreePath: string,
  branch: string | null
): Promise<SafetyStatus> {
  if (!branch) {
    return { level: 'caution', reasons: ['detached HEAD — cannot determine merge status'] }
  }

  const reasons: string[] = []
  let merged = false
  let clean = false
  let pushed = false

  // 1. Check if merged into default branch
  try {
    const defaultBranch = await getDefaultBranch(repoPath)
    await execFileAsync('git', ['merge-base', '--is-ancestor', branch, defaultBranch], {
      cwd: repoPath, timeout: 3000
    })
    merged = true
    reasons.push('merged into ' + defaultBranch)
  } catch {
    reasons.push('not merged')
  }

  // 2. Check if working tree is clean
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: worktreePath, timeout: 5000
    })
    if (stdout.trim() === '') {
      clean = true
      reasons.push('clean working tree')
    } else {
      const fileCount = stdout.trim().split('\n').length
      reasons.push(`${fileCount} uncommitted change${fileCount > 1 ? 's' : ''}`)
    }
  } catch {
    reasons.push('could not check working tree')
  }

  // 3. Check if pushed to remote
  try {
    await execFileAsync('git', ['rev-parse', '--verify', `origin/${branch}`], {
      cwd: repoPath, timeout: 3000
    })
    pushed = true
    reasons.push('pushed to remote')
  } catch {
    reasons.push('local only')
  }

  // Determine level
  // Merged + clean = safe (work is in main, nothing uncommitted to lose)
  // Merged + dirty = caution (commits are in main, but uncommitted changes would be lost)
  // Clean + pushed = safe (recoverable from remote, nothing uncommitted)
  // Dirty + pushed = caution (branch recoverable, but uncommitted changes would be lost)
  // Dirty + local only = danger (everything could be lost)
  // Clean + local only + not merged = danger (committed work not backed up anywhere)
  if (merged && clean) return { level: 'safe', reasons }
  if (merged && !clean) return { level: 'caution', reasons }
  if (clean && pushed) return { level: 'safe', reasons }
  if (pushed) return { level: 'caution', reasons }
  return { level: 'danger', reasons }
}

/**
 * Get how many commits a branch is ahead/behind the default branch.
 */
export async function getBranchDivergence(
  repoPath: string,
  branch: string
): Promise<{ ahead: number; behind: number }> {
  try {
    const defaultBranch = await getDefaultBranch(repoPath)
    const { stdout } = await execFileAsync(
      'git', ['rev-list', '--left-right', '--count', `${defaultBranch}...${branch}`],
      { cwd: repoPath, timeout: 3000 }
    )
    const parts = stdout.trim().split(/\s+/)
    return { ahead: parseInt(parts[1], 10) || 0, behind: parseInt(parts[0], 10) || 0 }
  } catch {
    return { ahead: 0, behind: 0 }
  }
}

// ─── Stash operations ───────────────────────────────────────────────

export interface StashEntry {
  index: number
  message: string
  date: string
  branch: string
}

/**
 * List all stashes in a repo.
 */
export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'git', ['stash', 'list', '--format=%gd|||%s|||%ci'],
      { cwd: repoPath, timeout: 10000 }
    )
    if (!stdout.trim()) return []

    return stdout.trim().split('\n').map((line) => {
      const [ref, message, date] = line.split('|||')
      const indexMatch = ref?.match(/stash@\{(\d+)\}/)
      const index = indexMatch ? parseInt(indexMatch[1], 10) : 0
      // Extract branch from message like "WIP on branch-name: abc123 message"
      const branchMatch = message?.match(/^(?:WIP on|On) ([^:]+):/)
      return {
        index,
        message: message || '',
        date: date || '',
        branch: branchMatch?.[1] || 'unknown'
      }
    })
  } catch {
    return []
  }
}

/**
 * Count stashes quickly (for scan summary).
 */
export async function countStashes(repoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('git', ['stash', 'list'], {
      cwd: repoPath, timeout: 5000
    })
    if (!stdout.trim()) return 0
    return stdout.trim().split('\n').length
  } catch {
    return 0
  }
}

/**
 * Drop a single stash by index.
 */
export async function dropStash(repoPath: string, index: number): Promise<void> {
  await execFileAsync('git', ['stash', 'drop', `stash@{${index}}`], {
    cwd: repoPath, timeout: 5000
  })
}

/**
 * Drop all stashes older than a given date. Returns count dropped.
 * Drops from highest index to lowest to avoid index shifting.
 */
export async function dropStashesBefore(repoPath: string, beforeDate: string): Promise<number> {
  const stashes = await listStashes(repoPath)
  const cutoff = new Date(beforeDate).getTime()
  const toDrop = stashes.filter((s) => new Date(s.date).getTime() < cutoff)

  // Sort by index descending so drops don't shift indexes
  toDrop.sort((a, b) => b.index - a.index)

  let dropped = 0
  for (const s of toDrop) {
    try {
      await dropStash(repoPath, s.index)
      dropped++
    } catch { /* skip failures */ }
  }
  return dropped
}
