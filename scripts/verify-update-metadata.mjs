import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'yaml'

const releaseDir = process.argv[2] || 'release'
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const expectedVersion = process.env.EXPECTED_APP_VERSION || packageJson.version
const metadata = parse(await readFile(join(releaseDir, 'latest-mac.yml'), 'utf8'))

if (metadata.version !== expectedVersion) {
  throw new Error(`Update metadata version ${metadata.version} does not match ${expectedVersion}`)
}
if (!Array.isArray(metadata.files) || metadata.files.length !== 1) {
  throw new Error('Update metadata must contain exactly one macOS ZIP')
}

const file = metadata.files[0]
const fileName = basename(decodeURIComponent(file.url))
if (!fileName.endsWith('.zip')) {
  throw new Error(`Update metadata must reference a ZIP, received ${fileName}`)
}

const artifactPath = join(releaseDir, fileName)
const artifact = await readFile(artifactPath)
const artifactStats = await stat(artifactPath)
const expectedSha512 = createHash('sha512').update(artifact).digest('base64')

if (file.sha512 !== expectedSha512 || metadata.sha512 !== expectedSha512) {
  throw new Error('Update metadata SHA-512 does not match the updater ZIP')
}
if (file.size !== artifactStats.size) {
  throw new Error('Update metadata size does not match the updater ZIP')
}
if (metadata.path !== fileName) {
  throw new Error('Update metadata path does not match the updater ZIP')
}

const blockmapStats = await stat(`${artifactPath}.blockmap`)
if (file.blockMapSize !== blockmapStats.size) {
  throw new Error('Update metadata block-map size does not match the updater block map')
}

console.log(`Verified updater metadata for ${fileName}`)
