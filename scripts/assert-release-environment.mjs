import { access } from 'node:fs/promises'

function fail(message) {
  console.error(`Release environment error: ${message}`)
  process.exit(1)
}

const expectedAppleTeamId = process.env.EXPECTED_APPLE_TEAM_ID || '49K92AGPFW'

if (process.platform !== 'darwin') {
  fail('signed macOS releases must be built on macOS')
}

if (!process.env.CSC_NAME?.startsWith('Developer ID Application:')) {
  fail('CSC_NAME must name a Developer ID Application certificate')
}
if (!process.env.CSC_NAME.endsWith(`(${expectedAppleTeamId})`)) {
  fail(`CSC_NAME must belong to Apple Developer team ${expectedAppleTeamId}`)
}

const apiKeyCredentials =
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER
const appleIdCredentials =
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID

if (process.env.APPLE_TEAM_ID && process.env.APPLE_TEAM_ID !== expectedAppleTeamId) {
  fail(`APPLE_TEAM_ID must be ${expectedAppleTeamId}`)
}

if (!apiKeyCredentials && !appleIdCredentials) {
  fail(
    'provide APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER ' +
      'or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID'
  )
}

if (apiKeyCredentials) {
  try {
    await access(process.env.APPLE_API_KEY)
  } catch {
    fail('APPLE_API_KEY must point to a readable App Store Connect .p8 key')
  }
}

console.log('Release credentials are present; signing and notarization gates are enabled.')
