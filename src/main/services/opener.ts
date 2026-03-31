import { shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function openInFinder(path: string): Promise<void> {
  shell.showItemInFolder(path)
}

export async function openInTerminal(path: string): Promise<void> {
  await execFileAsync('open', ['-a', 'Terminal', path])
}

export async function openInEditor(path: string, editor: 'code' | 'cursor'): Promise<void> {
  await execFileAsync(editor, [path])
}
