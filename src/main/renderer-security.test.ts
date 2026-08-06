import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { developmentRendererUrl, isTrustedRendererUrl } from './renderer-security'

const rendererDirectory = '/Applications/Worktree Manager.app/Contents/Resources/app.asar/out/renderer'

describe('renderer trust boundary', () => {
  it('ignores inherited development URLs in packaged builds', () => {
    const injectedUrl = 'https://attacker.example/app'
    expect(developmentRendererUrl(true, injectedUrl)).toBeUndefined()
    expect(isTrustedRendererUrl(injectedUrl, {
      isPackaged: true,
      developmentUrl: injectedUrl,
      packagedRendererDirectory: rendererDirectory
    })).toBe(false)
  })

  it('trusts only files contained by the packaged renderer directory', () => {
    const indexUrl = pathToFileURL(join(rendererDirectory, 'index.html')).href
    const mainProcessUrl = pathToFileURL(join(rendererDirectory, '..', 'main', 'index.js')).href

    expect(isTrustedRendererUrl(indexUrl, {
      isPackaged: true,
      developmentUrl: 'https://attacker.example',
      packagedRendererDirectory: rendererDirectory
    })).toBe(true)
    expect(isTrustedRendererUrl(mainProcessUrl, {
      isPackaged: true,
      packagedRendererDirectory: rendererDirectory
    })).toBe(false)
  })

  it('allows the configured development origin only outside packaged builds', () => {
    const options = {
      isPackaged: false,
      developmentUrl: 'http://localhost:5173',
      packagedRendererDirectory: rendererDirectory
    }

    expect(isTrustedRendererUrl('http://localhost:5173/settings', options)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5174/settings', options)).toBe(false)
  })
})
