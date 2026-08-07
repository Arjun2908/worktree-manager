import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Workflow = {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<
    string,
    {
      environment?: string
      permissions?: Record<string, string>
      steps?: Array<{
        name?: string
        run?: string
        uses?: string
        with?: Record<string, string>
      }>
    }
  >
}

async function loadWorkflow(name: string): Promise<{ source: string; workflow: Workflow }> {
  const source = await readFile(resolve('.github', 'workflows', name), 'utf8')
  return { source, workflow: parse(source) as Workflow }
}

describe('release workflow trust contract', () => {
  it('uses the short-lived built-in token for release planning', async () => {
    const { source, workflow } = await loadWorkflow('release.yml')
    const releasePlan = workflow.jobs['release-plan']
    const releasePlease = releasePlan.steps?.find((step) =>
      step.uses?.startsWith('googleapis/release-please-action@')
    )

    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(releasePlan.permissions).toEqual({
      contents: 'write',
      issues: 'write',
      'pull-requests': 'write'
    })
    expect(releasePlease?.with?.token).toBe('${{ github.token }}')
    expect(source).not.toContain('RELEASE_PLEASE_TOKEN')
  })

  it('keeps verification dispatchable and production signing environment-scoped', async () => {
    const { workflow: verify } = await loadWorkflow('verify.yml')
    const { workflow: release } = await loadWorkflow('release.yml')

    expect(verify.on).toHaveProperty('pull_request')
    expect(verify.on).toHaveProperty('push')
    expect(verify.on).toHaveProperty('workflow_dispatch')
    expect(release.jobs['release-macos'].environment).toBe('release')
    expect(release.jobs['release-macos'].permissions).toMatchObject({
      contents: 'write',
      'id-token': 'write',
      attestations: 'write'
    })
  })

  it('keeps immutable-release verification compatible with the built-in token', async () => {
    const { source, workflow } = await loadWorkflow('release.yml')
    const publish = workflow.jobs['release-macos'].steps?.find(
      (step) => step.name === 'Publish only after every verification gate passes'
    )?.run

    // Repository settings require Administration permission, which GITHUB_TOKEN cannot receive.
    // The workflow instead proves that the published release itself became immutable.
    expect(source).not.toContain('/immutable-releases')
    expect(publish).toBeDefined()

    const publishRelease = publish?.indexOf('gh release edit "$RELEASE_TAG" --draft=false --latest')
    const requireImmutable = publish?.indexOf(
      '"$(gh release view "$RELEASE_TAG" --json isImmutable --jq .isImmutable 2>/dev/null || true)" == "true"'
    )
    const verifyIntegrity = publish?.indexOf(
      'gh release verify "$RELEASE_TAG" -R "$GITHUB_REPOSITORY"'
    )

    expect(publishRelease).toBeGreaterThanOrEqual(0)
    expect(requireImmutable).toBeGreaterThan(publishRelease ?? -1)
    expect(verifyIntegrity).toBeGreaterThan(requireImmutable ?? -1)
  })

  it('separates the electron-builder qualifier from the full codesign identity', async () => {
    const { workflow } = await loadWorkflow('release.yml')
    const importCredentials = workflow.jobs['release-macos'].steps?.find(
      (step) => step.name === 'Import Developer ID certificate and App Store Connect key'
    )?.run
    const assertEnvironment = await readFile('scripts/assert-release-environment.mjs', 'utf8')
    const notarizeDmg = await readFile('scripts/notarize-dmg.sh', 'utf8')

    expect(importCredentials).toContain(
      'identity_qualifier="${identity#Developer ID Application: }"'
    )
    expect(importCredentials).toContain('echo "CSC_NAME=$identity_qualifier" >> "$GITHUB_ENV"')
    expect(importCredentials).toContain(
      'echo "RELEASE_SIGNING_IDENTITY=$identity" >> "$GITHUB_ENV"'
    )
    expect(importCredentials).not.toContain('echo "CSC_NAME=$identity" >> "$GITHUB_ENV"')
    expect(assertEnvironment).toContain(
      'releaseSigningIdentity !== `Developer ID Application: ${cscName}`'
    )
    expect(notarizeDmg).toContain('codesign --force --timestamp --sign "$signing_identity"')
  })

  it('rejects a prefixed CSC_NAME and accepts its matching qualifier', () => {
    const checkEnvironment = (cscName: string, releaseSigningIdentity: string) =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "Object.defineProperty(process, 'platform', { value: 'darwin' }); await import('./scripts/assert-release-environment.mjs')"
        ],
        {
          cwd: resolve('.'),
          encoding: 'utf8',
          env: {
            ...process.env,
            EXPECTED_APPLE_TEAM_ID: '49K92AGPFW',
            CSC_NAME: cscName,
            RELEASE_SIGNING_IDENTITY: releaseSigningIdentity,
            APPLE_API_KEY: resolve('package.json'),
            APPLE_API_KEY_ID: 'test-key',
            APPLE_API_ISSUER: 'test-issuer'
          }
        }
      )

    const qualifier = 'Arjun Gupta (49K92AGPFW)'
    const fullIdentity = `Developer ID Application: ${qualifier}`
    const valid = checkEnvironment(qualifier, fullIdentity)
    const invalid = checkEnvironment(fullIdentity, fullIdentity)

    expect(valid.status, valid.stderr).toBe(0)
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain('identity qualifier without its type prefix')
  })

  it('keeps release tags compatible with the updater and version verifier', async () => {
    const config = JSON.parse(await readFile('release-please-config.json', 'utf8'))

    expect(config).toMatchObject({
      'include-v-in-tag': true,
      'include-component-in-tag': false,
      'force-tag-creation': true,
      draft: true
    })
  })
})
