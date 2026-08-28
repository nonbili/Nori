#!/usr/bin/env bash
# Generate the Ed25519 keypair that signs desktop update manifests.
#
# The public half is committed as desktop/update-key.pem and compiled into the
# app (update.go), which is what makes it a trust anchor: the manifest cannot
# nominate its own key. The private half never enters the repo — store it as
# the DESKTOP_UPDATE_SIGNING_KEY repository secret and keep an offline backup, since
# losing it means shipping a new public key in a new build before signed
# updates work again.
#
# Usage: scripts/gen-signing-key.sh [private-key-output-path]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
priv="${1:-$HOME/.config/nori-desktop-update-key.pem}"
pub="$here/update-key.pem"

if [ -e "$priv" ]; then
  echo "refusing to overwrite existing private key at $priv" >&2
  exit 1
fi

mkdir -p "$(dirname "$priv")"
(umask 077 && openssl genpkey -algorithm ed25519 -out "$priv")
openssl pkey -in "$priv" -pubout -out "$pub"

cat >&2 <<MSG
private key: $priv  (never commit this)
public key:  $pub  (commit this)

Load the private key into the repository secret the release workflow reads:

  gh secret set DESKTOP_UPDATE_SIGNING_KEY < "$priv"
MSG
