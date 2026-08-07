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
