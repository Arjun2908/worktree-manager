#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:-release}"
expected_team_id="${EXPECTED_APPLE_TEAM_ID:-49K92AGPFW}"

if [[ ! -d "$release_dir" ]]; then
  echo "Release directory does not exist: $release_dir" >&2
  exit 1
fi

if [[ -z "${CSC_NAME:-}" || "$CSC_NAME" != "Developer ID Application:"*"($expected_team_id)" ]]; then
  echo "CSC_NAME must name a Developer ID Application certificate for team $expected_team_id" >&2
  exit 1
fi

dmg_count="$(find "$release_dir" -maxdepth 1 -type f -name '*.dmg' | wc -l | tr -d ' ')"
if [[ "$dmg_count" != "1" ]]; then
  echo "Expected exactly one DMG in $release_dir, found $dmg_count" >&2
  exit 1
fi
dmg_path="$(find "$release_dir" -maxdepth 1 -type f -name '*.dmg' -print -quit)"

notary_args=()
if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  notary_args=(--key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  if [[ "$APPLE_TEAM_ID" != "$expected_team_id" ]]; then
    echo "APPLE_TEAM_ID must match expected team $expected_team_id" >&2
    exit 1
  fi
  notary_args=(--apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  echo "Missing Apple notarization credentials" >&2
  exit 1
fi

echo "Signing final disk image with $CSC_NAME"
codesign --force --timestamp --sign "$CSC_NAME" "$dmg_path"
codesign --verify --strict --verbose=2 "$dmg_path"

notary_result="$(mktemp -t worktree-manager-notary)"
trap 'rm -f "$notary_result"' EXIT

echo "Submitting final disk image to Apple's notary service"
if ! xcrun notarytool submit "$dmg_path" "${notary_args[@]}" --wait --output-format json >"$notary_result"; then
  cat "$notary_result" >&2
  exit 1
fi

notary_status="$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(r.status || ''))" "$notary_result")"
notary_id="$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(r.id || ''))" "$notary_result")"
if [[ "$notary_status" != "Accepted" ]]; then
  echo "Apple rejected notarization submission $notary_id with status $notary_status" >&2
  if [[ -n "$notary_id" ]]; then
    xcrun notarytool log "$notary_id" "${notary_args[@]}" || true
  fi
  exit 1
fi

echo "Stapling notarization ticket from submission $notary_id"
xcrun stapler staple "$dmg_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"
