import { readFile } from 'node:fs/promises'

const tag = process.argv[2] || process.env.GITHUB_REF_NAME
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('A semantic release tag such as v1.2.3 is required')
}

const expectedVersion = tag.slice(1)
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const packageLock = JSON.parse(await readFile('package-lock.json', 'utf8'))
const manifest = JSON.parse(await readFile('.release-please-manifest.json', 'utf8'))

const versions = {
  'package.json': packageJson.version,
  'package-lock.json': packageLock.version,
  'package-lock root package': packageLock.packages?.['']?.version,
  'release-please manifest': manifest['.']
}

for (const [source, version] of Object.entries(versions)) {
  if (version !== expectedVersion) {
    throw new Error(`${source} has version ${version}; expected ${expectedVersion} from ${tag}`)
  }
}

console.log(`Verified semantic release version ${expectedVersion}`)
