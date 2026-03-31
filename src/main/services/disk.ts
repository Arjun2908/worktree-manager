import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function getDiskUsage(dirPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', dirPath], { timeout: 15000 })
    const kb = parseInt(stdout.split('\t')[0], 10)
    return kb * 1024 // Convert KB to bytes
  } catch {
    return 0
  }
}

export async function getDiskUsageBatch(paths: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {}

  // Run in parallel with a concurrency limit of 5
  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += 5) {
    chunks.push(paths.slice(i, i + 5))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (p) => {
      results[p] = await getDiskUsage(p)
    })
    await Promise.all(promises)
  }

  return results
}
