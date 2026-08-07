#!/usr/bin/env bash
set -euo pipefail

mode="${1:---release}"
release_dir="${2:-release}"

if [[ "$mode" != "--release" && "$mode" != "--adhoc" ]]; then
  echo "Usage: $0 [--release|--adhoc] [release-directory]" >&2
  exit 1
fi

package_version="${EXPECTED_APP_VERSION:-$(node -p "require('./package.json').version")}"
expected_team_id="${EXPECTED_APPLE_TEAM_ID:-49K92AGPFW}"
app_path="$(find "$release_dir" -maxdepth 2 -type d -name 'Worktree Manager.app' -print -quit)"
dmg_path="$(find "$release_dir" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
zip_path="$(find "$release_dir" -maxdepth 1 -type f -name '*.zip' -print -quit)"

if [[ -z "$dmg_path" || -z "$zip_path" ]]; then
  echo "Expected a DMG and ZIP in $release_dir" >&2
  exit 1
fi

temporary_root="$(mktemp -d -t worktree-manager-verification)"
mount_path="$temporary_root/dmg"
zip_extract_path="$temporary_root/zip"
smoke_log="$temporary_root/smoke.log"
mounted=0

cleanup() {
  if [[ "$mounted" == "1" ]]; then
    hdiutil detach "$mount_path" -quiet || true
  fi
  rm -rf "$temporary_root"
}
trap cleanup EXIT

require_fixed_detail() {
  local details="$1"
  local expected="$2"
  local subject="$3"

  if ! grep -Fq "$expected" <<<"$details"; then
    echo "$subject is missing expected signature detail: $expected" >&2
    echo "$details" >&2
    exit 1
  fi
}

require_regex_detail() {
  local details="$1"
  local expected="$2"
  local subject="$3"

  if ! grep -Eq "$expected" <<<"$details"; then
    echo "$subject is missing expected signature pattern: $expected" >&2
    echo "$details" >&2
    exit 1
  fi
}

verify_app() {
  local candidate="$1"
  local executable_name
  local executable_path
  local architectures
  local bundle_id
  local bundle_version
  local entitlements_compact
  local forbidden_entitlement
  local fuse_output
  local mach_o_binary
  local mach_o_count=0
  local signature_details

  codesign --verify --deep --strict --verbose=2 "$candidate"
  fuse_output="$(
    NO_COLOR=1 FORCE_COLOR=0 node_modules/.bin/electron-fuses read --app "$candidate" |
      node scripts/strip-ansi.mjs
  )"
  for fuse_expectation in \
    'RunAsNode is Disabled' \
    'EnableCookieEncryption is Enabled' \
    'EnableNodeOptionsEnvironmentVariable is Disabled' \
    'EnableNodeCliInspectArguments is Disabled' \
    'EnableEmbeddedAsarIntegrityValidation is Enabled' \
    'OnlyLoadAppFromAsar is Enabled' \
    'LoadBrowserProcessSpecificV8Snapshot is Disabled' \
    'GrantFileProtocolExtraPrivileges is Enabled' \
    'WasmTrapHandlers is Enabled'; do
    grep -Fq "$fuse_expectation" <<<"$fuse_output" || {
      echo "Unexpected Electron fuse state: $fuse_expectation" >&2
      echo "$fuse_output" >&2
      exit 1
    }
  done
  if grep -Fq 'undefined is' <<<"$fuse_output"; then
    echo "Electron contains a fuse unknown to the pinned verifier" >&2
    echo "$fuse_output" >&2
    exit 1
  fi
  EXPECTED_APP_VERSION="$package_version" node scripts/verify-packaged-contents.mjs \
    "$candidate/Contents/Resources/app.asar"

  while IFS= read -r -d '' mach_o_binary; do
    if file -b "$mach_o_binary" | grep -q 'Mach-O'; then
      architectures="$(lipo -archs "$mach_o_binary")"
      [[ "$architectures" == *arm64* && "$architectures" == *x86_64* ]] || {
        echo "Bundle contains a non-universal Mach-O file: $mach_o_binary ($architectures)" >&2
        exit 1
      }
      mach_o_count=$((mach_o_count + 1))
    fi
  done < <(find "$candidate/Contents" -type f -print0)
  [[ "$mach_o_count" -gt 0 ]] || {
    echo "Bundle does not contain any Mach-O executables" >&2
    exit 1
  }
  executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$candidate/Contents/Info.plist")"
  executable_path="$candidate/Contents/MacOS/$executable_name"
  architectures="$(lipo -archs "$executable_path")"
  [[ "$architectures" == *arm64* && "$architectures" == *x86_64* ]] || {
    echo "App executable is not universal: $architectures" >&2
    exit 1
  }

  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$candidate/Contents/Info.plist")"
  bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$candidate/Contents/Info.plist")"
  [[ "$bundle_id" == "com.arjungupta.worktree-manager" ]] || {
    echo "Unexpected bundle identifier: $bundle_id" >&2
    exit 1
  }
  [[ "$bundle_version" == "$package_version" ]] || {
    echo "Unexpected bundle version: $bundle_version" >&2
    exit 1
  }

  if [[ "$mode" == "--release" ]]; then
    signature_details="$(codesign -d --verbose=4 "$candidate" 2>&1)"
    require_fixed_detail "$signature_details" 'Authority=Developer ID Application:' 'Release app'
    require_fixed_detail "$signature_details" "($expected_team_id)" 'Release app'
    require_fixed_detail "$signature_details" "TeamIdentifier=$expected_team_id" 'Release app'
    require_regex_detail "$signature_details" '^CodeDirectory .* flags=[^ ]*\(([^,()]+,)*runtime(,[^,()]+)*\)' 'Release app'
    entitlements_compact="$(codesign -d --entitlements :- "$candidate" 2>/dev/null | tr -d '[:space:]')"
    for forbidden_entitlement in \
      'com.apple.security.get-task-allow' \
      'com.apple.security.cs.disable-library-validation'; do
      if [[ "$entitlements_compact" == *"<key>$forbidden_entitlement</key><true/>"* ]]; then
        echo "Release app has forbidden entitlement: $forbidden_entitlement" >&2
        exit 1
      fi
    done
    spctl --assess --type execute --verbose=4 "$candidate"
    xcrun stapler validate "$candidate"
  fi
}

smoke_app() {
  local candidate="$1"
  local executable_name
  local executable_path
  local smoke_pid
  local attempt
  local smoke_exit=0
  local marker_seen=0

  executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$candidate/Contents/Info.plist")"
  executable_path="$candidate/Contents/MacOS/$executable_name"
  : >"$smoke_log"
  WORKTREE_MANAGER_DISABLE_UPDATES=1 "$executable_path" --smoke-test --disable-gpu >"$smoke_log" 2>&1 &
  smoke_pid=$!

  for attempt in $(seq 1 30); do
    if grep -q 'WORKTREE_MANAGER_SMOKE_TEST_OK' "$smoke_log"; then
      marker_seen=1
      break
    fi
    if ! kill -0 "$smoke_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [[ "$marker_seen" == "1" ]]; then
    for attempt in $(seq 1 20); do
      if ! kill -0 "$smoke_pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done
  fi

  if kill -0 "$smoke_pid" 2>/dev/null; then
    kill "$smoke_pid" 2>/dev/null || true
    wait "$smoke_pid" 2>/dev/null || true
    cat "$smoke_log" >&2
    echo "Packaged app smoke test timed out" >&2
    exit 1
  fi
  wait "$smoke_pid" || smoke_exit=$?
  if [[ "$smoke_exit" != "0" ]] || ! grep -q 'WORKTREE_MANAGER_SMOKE_TEST_OK' "$smoke_log"; then
    cat "$smoke_log" >&2
    echo "Packaged app smoke test failed" >&2
    exit 1
  fi
}

if [[ -n "$app_path" ]]; then
  verify_app "$app_path"
fi
hdiutil verify "$dmg_path"
unzip -tq "$zip_path"
EXPECTED_APP_VERSION="$package_version" node scripts/verify-update-metadata.mjs "$release_dir"

if [[ "$mode" == "--release" ]]; then
  codesign --verify --strict --verbose=2 "$dmg_path"
  dmg_signature_details="$(codesign -d --verbose=4 "$dmg_path" 2>&1)"
  require_fixed_detail "$dmg_signature_details" 'Authority=Developer ID Application:' 'Release DMG'
  require_fixed_detail "$dmg_signature_details" "($expected_team_id)" 'Release DMG'
  require_fixed_detail "$dmg_signature_details" "TeamIdentifier=$expected_team_id" 'Release DMG'
  spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"
  xcrun stapler validate "$dmg_path"
fi

mkdir -p "$mount_path" "$zip_extract_path"
hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_path" -quiet
mounted=1
mounted_app="$(find "$mount_path" -maxdepth 2 -type d -name 'Worktree Manager.app' -print -quit)"
[[ -n "$mounted_app" ]] || { echo "DMG does not contain Worktree Manager.app" >&2; exit 1; }
verify_app "$mounted_app"
smoke_app "$mounted_app"

ditto -x -k "$zip_path" "$zip_extract_path"
zipped_app="$(find "$zip_extract_path" -maxdepth 2 -type d -name 'Worktree Manager.app' -print -quit)"
[[ -n "$zipped_app" ]] || { echo "ZIP does not contain Worktree Manager.app" >&2; exit 1; }
verify_app "$zipped_app"
smoke_app "$zipped_app"

echo "Verified universal macOS DMG, updater ZIP, signatures, metadata, and packaged launch"
