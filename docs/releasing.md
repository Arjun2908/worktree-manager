# Release and update system

Worktree Manager releases are built from a tagged commit on GitHub-hosted macOS, signed with a Developer ID Application certificate, notarized by Apple, stapled, smoke-tested from both distribution formats, and published only after every pre-publication gate passes. Any failure before publication leaves a private draft release; post-publication verification can still fail loudly without making the immutable release private again.

The historical `v1.0.0` artifact was created before these gates, is not notarized, and contains no updater. It must not be treated as a verified download. Existing users need a one-time manual install of the first workflow-produced release; automatic updates begin after that migration.

## Release flow

```text
Conventional commits on main
        │
        ▼
Release Please keeps one version + changelog PR current
        │ merge the PR
        ▼
Draft GitHub release and bound vX.Y.Z tag
        │
        ▼
Tests · type checks · full-lock audit · production build
        │
        ▼
Universal app signed + app notarized/stapled
        │
        ▼
DMG signed + outer DMG notarized/stapled
        │
        ▼
codesign · Gatekeeper · stapler · hdiutil · ZIP integrity
        │
        ▼
Launch smoke tests from mounted DMG and extracted updater ZIP
        │
        ▼
SHA-256 checksums + GitHub build-provenance attestations
        │
        ▼
Assets uploaded and draft published as Latest; release and tag become immutable
        │
        ▼
Daily download re-verifies public assets, provenance, trust, and launch
```

The updater ZIP, its block map, and `latest-mac.yml` are published together. Installed production builds use `electron-updater` to check the public GitHub release feed, show update state in the sidebar, download only after the user confirms, and install after the user chooses **Restart to update**.

## One-time repository setup

Create a GitHub environment named `release`. Requiring a reviewer for that environment is recommended so certificate access and public publication have a human approval boundary.

Add the signing and notarization credentials to the `release` environment:

| Secret | Purpose |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | Base64-encoded Developer ID Application certificate and private key exported as PKCS#12 |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the PKCS#12 file |
| `APPLE_API_KEY_P8` | Contents of an App Store Connect API `.p8` key authorized for notarization |
| `APPLE_API_KEY_ID` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect API issuer UUID |

The Developer ID certificate must belong to Apple Developer team `49K92AGPFW`. The workflow pins that Team ID across secret import, app and DMG signature inspection, and notarization preflight so an accidentally supplied certificate from another team cannot break update trust continuity.

Add `RELEASE_PLEASE_TOKEN` as a **repository or organization Actions secret**, not an environment secret. The `release-plan` job deliberately does not enter the protected release environment. Use a fine-grained token scoped to this repository with Contents, Pull requests, and Issues read/write access. This lets Release Please's version PR trigger the normal pull-request checks; rotate it on the same schedule as other release credentials.

Generate the certificate value on macOS without committing it:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

Before enabling releases, protect `main` and require these checks:

- `Verify / Quality and security`
- `Verify / macOS package smoke`

Enable immutable GitHub Releases **before** publishing the first workflow-produced release. Drafts remain editable while the workflow attaches and verifies assets; immutability starts at publication and protects that first trusted release and every later one. Legacy `v1.0.0` remains outside this contract.

Do not claim the pipeline is production-active until the environment, all six secrets, branch protection, and the first workflow-produced release exist. A source-only installation has a fail-closed release workflow, but it cannot sign, notarize, or publish without this repository configuration. The daily health workflow is expected to stay red until the first verified release supersedes legacy `v1.0.0`.

## Creating a release

Use Conventional Commit subjects. Release Please maps `fix:` to a patch, `feat:` to a minor, and a `!` or `BREAKING CHANGE` footer to a major version. It keeps `package.json`, `package-lock.json`, `CHANGELOG.md`, and `.release-please-manifest.json` in one release PR so Git, the app bundle, the updater metadata, and the GitHub tag cannot drift.

1. Merge normal changes through a green pull request.
2. Review and merge the automated `chore(main): release …` PR when ready to ship.
3. Approve the `release` environment, if required.
4. Wait for `Release / Sign, notarize, verify, and publish macOS` to finish.
5. Download the DMG from the GitHub release and optionally verify its checksum or attestation.

If a release build fails because of a transient Apple/GitHub outage or corrected credential, rerun the same draft-tag workflow. A source or workflow defect cannot be repaired by rerunning: the tag intentionally remains bound to the original commit. Abandon that unpublished draft and release a fixed higher version from `main`. For a later transient manual retry, dispatch the **Release** workflow at the draft tag ref so GitHub's signed provenance names the exact source commit:

```bash
gh workflow run release.yml --ref v1.2.3 -f tag=v1.2.3
```

The workflow refuses published releases, side-branch tags, a tag that does not point at the checked-out source, and a dispatch event whose attested source SHA differs from that checkout.

## Verification contract

`npm run verify` is the source gate. It blocks every production dependency advisory starting at low severity, performs a second full dependency-tree audit that blocks moderate, high, and critical advisories, runs all tests and strict main/renderer TypeScript checks, and creates the production build. Low-severity development-tool advisories remain visible but do not block a release; runtime dependency advisories always do.

`npm run dist:verify` builds an ad-hoc signed universal DMG and ZIP for continuous package smoke testing. It proves packaging and launch behavior but is never published.

`npm run dist:release` refuses to start without explicit Developer ID and Apple credentials. It then performs the production contract:

- preflight authentication against Apple's notary service before the expensive universal build;
- universal `arm64` + `x86_64` executable inspection;
- strict, complete Electron fuse inspection (no unknown fuses; no Run-as-Node, Node options, inspector, browser-only snapshot dependency, or alternate unpacked app; embedded ASAR integrity and WebAssembly bounds trapping enforced). The file-protocol privilege fuse remains enabled because the packaged renderer is intentionally served from `file://`; navigation, permissions, CSP, context isolation, and renderer sandboxing constrain that surface;
- Developer ID signature validation for the app and DMG;
- Apple notarization and stapling validation for the app and outer DMG;
- Gatekeeper assessment of the app and DMG;
- DMG filesystem and ZIP integrity checks;
- updater metadata SHA-512, byte size, and block-map validation;
- launch-to-renderer smoke tests from the mounted DMG and extracted ZIP; and
- deterministic SHA-256 checksums generated after final signing and stapling.

`Release Health / Download and reverify published macOS release` runs daily and can also be dispatched for a specific published tag. It downloads what users actually receive from GitHub, checks every SHA-256 digest and GitHub provenance attestation, then repeats DMG/ZIP integrity, universal architecture, Developer ID, Gatekeeper, stapling, updater metadata, and packaged-launch checks. A replaced, deleted, corrupted, revoked, or no-longer-trusted public artifact therefore turns the release-health check red even if the original build passed.

To verify a downloaded checksum:

```bash
shasum -a 256 -c SHA256SUMS
```

To verify GitHub build provenance, bind it to the release workflow and tagged source commit:

```bash
tag=v1.2.3
git fetch origin "refs/tags/$tag:refs/tags/$tag"
gh attestation verify Worktree-Manager-1.2.3-universal.dmg \
  -R Arjun2908/worktree-manager \
  --signer-workflow Arjun2908/worktree-manager/.github/workflows/release.yml \
  --source-digest "$(git rev-list -n 1 "$tag")"
```

Release-integrity commands require GitHub CLI 2.93.0 or newer. The hosted release workflow checks for immutable-release CLI support before it builds or publishes anything; upgrade `gh` before running the verification commands locally.

## Rollback and incident handling

Auto-update never downgrades an installed app. If a release is defective, remove it from **Latest**, publish a fixed higher patch version, and keep the bad release notes explicit. If signing credentials may be compromised, stop the release environment, rotate the GitHub and App Store Connect credentials, revoke the affected Developer ID certificate with Apple, and publish only after the replacement pipeline passes from a clean runner.

## Maintenance

Dependabot checks npm dependencies weekly and pinned GitHub Actions monthly. Those PRs go through the same source and package gates. Review major Electron upgrades deliberately; never merge a dependency update solely because the audit is green—the packaged smoke test and macOS signature checks remain authoritative.

The build runtime is pinned to the current patched Node 22 LTS patch in `.nvmrc`, `.node-version`, `package.json`, and every workflow. **Toolchain Health / Node 22 pin is current** compares those pins with Node's official distribution index each week and fails when a newer Node 22 patch needs review.

GitHub disables scheduled workflows in a public repository after 60 days without repository activity. Check that both **Release Health** and **Toolchain Health** remain enabled during quiet periods and re-enable them in Actions if GitHub pauses them. If uninterrupted monitoring is a hard requirement, have an external monitor call the workflows' existing `workflow_dispatch` endpoints rather than relying on repository cron alone.

## Authoritative references

- [electron-builder macOS code signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/)
- [electron-builder macOS notarization](https://www.electron.build/docs/notarization/)
- [electron-builder auto-update](https://www.electron.build/docs/features/auto-update/)
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple: Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
- [GitHub: Workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [GitHub: Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [GitHub: Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [Node.js release archive](https://nodejs.org/en/download/archive/v22)
