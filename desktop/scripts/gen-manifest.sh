#!/usr/bin/env bash
# Build the Wails update manifest (latest.json) from the release artifacts.
#
# The app reads this file from the rolling `desktop-latest` release (see
# update.go) through the updater's `endpoint` provider. Only the artifacts the
# updater can actually install in place are listed: it unpacks .zip/.tar.gz and
# swaps the binary or the .app bundle, so the DMG and the NSIS installer stay
# first-install-only channels.
#
# Each artifact's SHA-256 digest is signed with the Ed25519 key whose public
# half is compiled into the app (see update-key.pem). Signing is mandatory
# unless --allow-unsigned is passed: an unsigned manifest still installs on a
# client that pins the key — runVerification falls back to digest-only when no
# signature is present — so publishing one by accident is a silent downgrade.
#
# Usage: scripts/gen-manifest.sh [--allow-unsigned] <version> <asset-base-url> <dist-dir>
#   DESKTOP_UPDATE_SIGNING_KEY_FILE  PEM-encoded Ed25519 private key
#                                    (required unless --allow-unsigned).
set -euo pipefail

allow_unsigned=false
if [ "${1:-}" = "--allow-unsigned" ]; then
  allow_unsigned=true
  shift
fi

version="${1:?version required}"
base_url="${2:?asset base url required}"
dist="${3:?dist dir required}"

key="${DESKTOP_UPDATE_SIGNING_KEY_FILE:-}"
if [ -z "$key" ] && [ "$allow_unsigned" != true ]; then
  echo "gen-manifest: DESKTOP_UPDATE_SIGNING_KEY_FILE is required (or pass --allow-unsigned)" >&2
  exit 1
fi
if [ -n "$key" ] && [ ! -f "$key" ]; then
  echo "gen-manifest: signing key $key does not exist" >&2
  exit 1
fi

# filename -> "<platform> <arch>"; must stay in sync with the artifact names in
# .github/workflows/desktop-release.yml.
entries=(
  "nori-darwin-arm64-app.zip darwin arm64"
  "nori-darwin-amd64-app.zip darwin amd64"
  "nori-linux-amd64.tar.gz linux amd64"
  "nori-windows-amd64-portable.zip windows amd64"
)

artifacts='[]'
for entry in "${entries[@]}"; do
  read -r file platform arch <<<"$entry"
  path="$dist/$file"
  if [ ! -f "$path" ]; then
    echo "gen-manifest: missing required artifact $path" >&2
    exit 1
  fi
  # The manifest schema takes the digest base64-encoded, not hex.
  digest_bin=$(mktemp)
  openssl dgst -binary -sha256 "$path" > "$digest_bin"
  digest=$(base64 < "$digest_bin" | tr -d '\n')
  size=$(wc -c <"$path")

  # The "ed25519" algorithm signs the message it is handed, and the updater
  # hands the verifier the digest it streamed while downloading — so the
  # signature covers the digest bytes, not the file.
  signature=""
  if [ -n "$key" ]; then
    signature=$(openssl pkeyutl -sign -inkey "$key" -rawin -in "$digest_bin" | base64 | tr -d '\n')
  fi
  rm -f "$digest_bin"

  artifacts=$(jq \
    --arg url "$base_url/$file" \
    --arg filename "$file" \
    --arg platform "$platform" \
    --arg arch "$arch" \
    --arg digest "$digest" \
    --arg signature "$signature" \
    --argjson size "$size" \
    '. + [{
       url: $url,
       filename: $filename,
       platform: $platform,
       arch: $arch,
       size: $size,
       digestAlgo: "sha256",
       digest: $digest
     }
     + (if $signature == "" then {}
        else {signatureAlgo: "ed25519", signature: $signature} end)]' <<<"$artifacts")
done

jq -n \
  --arg version "$version" \
  --arg publishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson artifacts "$artifacts" \
  '{
     schemaVersion: 1,
     version: $version,
     channel: "stable",
     name: ("Nori Desktop " + $version),
     publishedAt: $publishedAt,
     artifacts: $artifacts
   }'
