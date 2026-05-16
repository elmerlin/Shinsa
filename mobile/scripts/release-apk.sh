#!/usr/bin/env bash
# Push a new Android APK to the public download page + update latest.json
# so installed clients see the new build via in-app auto-update.
#
# Usage:
#   ./scripts/release-apk.sh <local-apk> <version> <versionCode> [notes]
#
# Example:
#   ./scripts/release-apk.sh ./build/app-release.apk 1.0.2 3 "Fixes feed scrolling"
#
# Requires SSH access to root@159.65.91.103 with the same creds the rest
# of the deploy flow uses. APK + manifest land in /var/www/shinsa-download
# which nginx serves at https://pumpshinsa.com/download/.
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

# Hash + size before we touch the server — gives us a sanity check if
# something on the remote side mangles the upload.
SHA=$(shasum -a 256 "$APK_LOCAL" | awk '{print $1}')
SIZE=$(stat -f%z "$APK_LOCAL" 2>/dev/null || stat -c%s "$APK_LOCAL")
RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "→ uploading APK ($((SIZE / 1024 / 1024)) MB, sha256 ${SHA:0:12}…)"
scp -q "$APK_LOCAL" "$SERVER:$DEST_APK"

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
