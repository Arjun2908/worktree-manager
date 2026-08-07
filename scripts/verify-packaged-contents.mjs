import { extractFile, listPackage } from '@electron/asar'

const asarPath = process.argv[2]
if (!asarPath) throw new Error('Usage: verify-packaged-contents.mjs <app.asar>')

const packageMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'))
const productionDependencies = Object.keys(packageMetadata.dependencies || {}).sort()
if (
  productionDependencies.length !== 1 ||
  productionDependencies[0] !== 'electron-updater'
) {
  throw new Error(
    `Packaged production dependencies must contain only electron-updater; found ${productionDependencies.join(', ')}`
  )
}

const packagedFiles = listPackage(asarPath)
const requiredPrefixes = [
  '/node_modules/electron-updater/',
  '/out/main/',
  '/out/preload/',
  '/out/renderer/'
]
for (const prefix of requiredPrefixes) {
  if (!packagedFiles.some((file) => file.startsWith(prefix))) {
    throw new Error(`Packaged app is missing required content: ${prefix}`)
  }
}

const forbiddenRendererDependencies = [
  '@tanstack',
  'date-fns',
  'lucide-react',
  'react',
  'react-dom',
  'zustand'
]
for (const dependency of forbiddenRendererDependencies) {
  const prefix = `/node_modules/${dependency}/`
  if (packagedFiles.some((file) => file.startsWith(prefix))) {
    throw new Error(`Renderer dependency leaked into app.asar: ${dependency}`)
  }
}

console.log('Verified minimal packaged dependencies and bundled renderer content')
