#!/usr/bin/env bash
# Push a new Android APK to the public download page + update latest.json
# so installed clients see the new build via in-app auto-update.
#
# SIGNING — read this before changing anything:
#   The installed sideload base is signed with mobile/android/app/debug.keystore
#   (CN=Android Debug). EAS / cloud builds use a DIFFERENT release key, so an APK
#   straight from EAS can NOT update over the base — Android rejects it with
#   INSTALL_FAILED_UPDATE_INCOMPATIBLE and the in-app updater silently fails for
#   every existing user. To make that impossible, this script ALWAYS re-signs the
#   input APK with the base key before publishing, and ABORTS if the resulting
#   signature doesn't match the base fingerprint. So you can feed it an APK from
#   anywhere (EAS cloud, eas build --local, gradle) and it publishes one your
#   users can actually install.
#
#   Pass SKIP_RESIGN=1 only after you've intentionally migrated the whole base to
#   a new release keystore (which requires users to uninstall + reinstall once)
#   and updated BASE_CERT_SHA256 below.
#
# Usage:
#   ./scripts/release-apk.sh <local-apk> <version> <versionCode> [notes]
#
# Example:
#   ./scripts/release-apk.sh /tmp/shinsa.apk 1.0.20 20 "Fixes X"
#
# Requires SSH access to root@159.65.91.103. APK + manifest land in
# /var/www/shinsa-download which nginx serves at https://pumpshinsa.com/download/.
set -euo pipefail

APK_LOCAL="${1:-}"
VERSION="${2:-}"
VERSION_CODE="${3:-}"
NOTES="${4:-Build $VERSION}"

if [[ -z "$APK_LOCAL" || -z "$VERSION" || -z "$VERSION_CODE" ]]; then
  echo "usage: $0 <local-apk> <version> <versionCode> [notes]" >&2
  exit 1
fi

if [[ ! -f "$APK_LOCAL" ]]; then
  echo "APK not found: $APK_LOCAL" >&2
  exit 1
fi

SERVER="root@159.65.91.103"
DEST_DIR="/var/www/shinsa-download"
DEST_APK="$DEST_DIR/shinsa.apk"
DEST_MANIFEST="$DEST_DIR/latest.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYSTORE="$SCRIPT_DIR/../android/app/debug.keystore"
KS_ALIAS="androiddebugkey"
KS_PASS="android"
# SHA-256 of the signing cert the installed base uses. The published APK MUST
# match this, or in-app auto-update breaks for every existing user.
BASE_CERT_SHA256="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# ── Re-sign with the base key (the crux — see SIGNING note above) ──────────
if [[ "${SKIP_RESIGN:-0}" == "1" ]]; then
  echo "→ SKIP_RESIGN=1 — publishing input as-is (signature NOT enforced)"
  APK_TO_PUBLISH="$APK_LOCAL"
else
  if [[ -z "${APKSIGNER:-}" ]]; then
    APKSIGNER="$(ls "$HOME"/Library/Android/sdk/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)"
  fi
  [[ -n "${APKSIGNER:-}" && -x "$APKSIGNER" ]] || {
    echo "apksigner not found — set \$APKSIGNER or install Android build-tools" >&2; exit 1; }
  [[ -f "$KEYSTORE" ]] || { echo "base keystore not found: $KEYSTORE" >&2; exit 1; }

  APK_TO_PUBLISH="$WORKDIR/shinsa-signed.apk"
  echo "→ re-signing with base key ($KS_ALIAS @ debug.keystore)"
  "$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "$KS_ALIAS" \
    --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --out "$APK_TO_PUBLISH" "$APK_LOCAL"

  # Hard guard: never publish an APK whose signature doesn't match the base.
  GOT_CERT="$("$APKSIGNER" verify --print-certs "$APK_TO_PUBLISH" 2>/dev/null | awk '/SHA-256 digest/{print $NF; exit}')"
  if [[ "$GOT_CERT" != "$BASE_CERT_SHA256" ]]; then
    echo "ABORT: signed cert ${GOT_CERT:-<none>} != base $BASE_CERT_SHA256" >&2
    echo "       publishing this would break in-app auto-update for all users." >&2
    exit 1
  fi
  echo "  ✓ matches installed base key (SHA-256 ${GOT_CERT:0:12}…)"
fi

# Hash + size of the FINAL (re-signed) artifact — what users actually download.
SHA=$(shasum -a 256 "$APK_TO_PUBLISH" | awk '{print $1}')
SIZE=$(stat -f%z "$APK_TO_PUBLISH" 2>/dev/null || stat -c%s "$APK_TO_PUBLISH")
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "→ uploading APK ($((SIZE / 1024 / 1024)) MB, sha256 ${SHA:0:12}…)"
scp -q "$APK_TO_PUBLISH" "$SERVER:$DEST_APK"

echo "→ writing latest.json (version=$VERSION code=$VERSION_CODE)"
# Build the JSON locally first so a malformed input fails fast.
MANIFEST=$(cat <<EOF
{
  "version": "$VERSION",
  "versionCode": $VERSION_CODE,
  "apkUrl": "https://pumpshinsa.com/download/shinsa.apk",
  "size": $SIZE,
  "sha256": "$SHA",
  "releasedAt": "$RELEASED_AT",
  "notes": $(printf '%s' "$NOTES" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),
  "mandatory": false
}
EOF
)
echo "$MANIFEST" | ssh "$SERVER" "cat > $DEST_MANIFEST"

echo "→ verifying server-side"
ssh "$SERVER" "ls -la $DEST_APK && cat $DEST_MANIFEST"

echo
echo "Released v$VERSION (build $VERSION_CODE) → https://pumpshinsa.com/download/"
