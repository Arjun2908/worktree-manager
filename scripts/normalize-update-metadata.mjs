import { createHash } from 'node:crypto'
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse, stringify } from 'yaml'

const releaseDir = process.argv[2] || 'release'
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const entries = await readdir(releaseDir)
const zipFiles = entries.filter((entry) => entry.endsWith('.zip'))

if (zipFiles.length !== 1) {
  throw new Error(`Expected exactly one updater ZIP in ${releaseDir}, found ${zipFiles.length}`)
}

const zipName = zipFiles[0]
const zipPath = join(releaseDir, zipName)
const zipContents = await readFile(zipPath)
const zipStats = await stat(zipPath)
const zipSha512 = createHash('sha512').update(zipContents).digest('base64')
const zipBlockmapPath = `${zipPath}.blockmap`
const zipBlockmapStats = await stat(zipBlockmapPath)
const metadataPath = join(releaseDir, 'latest-mac.yml')
const existingMetadata = parse(await readFile(metadataPath, 'utf8')) || {}

const metadata = {
  ...existingMetadata,
  version: packageJson.version,
  files: [
    {
      url: basename(zipPath),
      sha512: zipSha512,
      size: zipStats.size,
      blockMapSize: zipBlockmapStats.size
    }
  ],
  path: basename(zipPath),
  sha512: zipSha512
}

await writeFile(metadataPath, stringify(metadata), 'utf8')

for (const entry of entries.filter((name) => name.endsWith('.dmg.blockmap'))) {
  await unlink(join(releaseDir, entry))
}

console.log(`Normalized latest-mac.yml for ${zipName}`)
