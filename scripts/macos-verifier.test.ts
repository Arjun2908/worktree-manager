import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('macOS release signature verifier', () => {
  it('recognizes hardened runtime in codesign verbose output', async () => {
    const source = await readFile('scripts/verify-macos-artifacts.sh', 'utf8')
    const singleFlagOutput = [
      'Executable=/Applications/Worktree Manager.app/Contents/MacOS/Worktree Manager',
      'Identifier=com.arjungupta.worktree-manager',
      'Format=app bundle with Mach-O universal (x86_64 arm64)',
      'CodeDirectory v=20500 size=764 flags=0x10000(runtime) hashes=13+7 location=embedded',
      'Authority=Developer ID Application: Arjun Gupta (49K92AGPFW)',
      'TeamIdentifier=49K92AGPFW'
    ].join('\n')
    const multipleFlagsOutput = singleFlagOutput.replace(
      '(runtime)',
      '(library-validation,runtime)'
    )
    const missingRuntimeOutput = singleFlagOutput.replace('(runtime)', '(library-validation)')
    const hardenedRuntime =
      /^CodeDirectory .* flags=[^ ]*\((?:[^,()]+,)*runtime(?:,[^,()]+)*\)/m

    expect(singleFlagOutput).toMatch(hardenedRuntime)
    expect(multipleFlagsOutput).toMatch(hardenedRuntime)
    expect(missingRuntimeOutput).not.toMatch(hardenedRuntime)
    expect(source).toContain(
      "require_regex_detail \"$signature_details\" '^CodeDirectory .* flags=[^ ]*\\(([^,()]+,)*runtime(,[^,()]+)*\\)' 'Release app'"
    )
    expect(source).not.toContain("grep -Eq '^flags=.*runtime'")
  })

  it('prints signature details when a required assertion fails', async () => {
    const source = await readFile('scripts/verify-macos-artifacts.sh', 'utf8')

    expect(source).toContain('is missing expected signature detail')
    expect(source).toContain('is missing expected signature pattern')
    expect(source).toContain('echo "$details" >&2')
  })
})
