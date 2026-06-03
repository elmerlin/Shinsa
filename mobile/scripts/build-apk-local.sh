#!/usr/bin/env bash
# Build the Android release APK LOCALLY and publish it to the sideload download
# site — the supported one-command release path for installed Android users.
#
# WHY NOT `eas build --local`: it builds in a /tmp project copy where
# react-native-reanimated can't find libworklets.so (it looks at the legacy
# `intermediates/cmake/release/obj/<abi>/` path, which the temp-copy build
# doesn't produce → "no known rule to make it"). A direct in-repo gradle build
# DOES produce that path, so we build with gradle straight from android/.
#
# What this does:
#   1. version      = `expo.version` in app.json  (bump that first for a release)
#      versionCode  = (current live manifest versionCode) + 1  — guaranteed
#                     monotonic over the installed sideload base, so auto-update
#                     always triggers and we never re-collide. Override with a
#                     2nd arg or $VERSION_CODE.
#   2. writes those into android/app/build.gradle (gitignored CNG dir; a direct
#      gradle build doesn't read EAS's remote version source).
#   3. EXPO_PUBLIC_API_URL=<prod> ./gradlew :app:assembleRelease
#      (the release variant signs with debug.keystore = the base key, so it
#      installs over every existing install).
#   4. hands the APK to release-apk.sh → re-sign guard + upload + latest.json.
#
# Usage:
#   bash scripts/build-apk-local.sh "Notes shown in the in-app update banner"
#   bash scripts/build-apk-local.sh "Notes" 25          # explicit versionCode
#   SKIP_PUBLISH=1 bash scripts/build-apk-local.sh "x"  # build only, don't publish
#
# macOS dev machine assumed (sed -i '', stat -f%z, /usr/libexec/java_home).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_URL="${API_URL:-https://pumpshinsa.com}"
MANIFEST_URL="https://pumpshinsa.com/download/latest.json"

NOTES="${1:-}"

VERSION="$(node -e "process.stdout.write(String(require('$MOBILE_DIR/app.json').expo.version||''))")"
[[ -n "$VERSION" ]] || { echo "could not read expo.version from app.json" >&2; exit 1; }
NOTES="${NOTES:-Build $VERSION}"

# versionCode: explicit 2nd arg / $VERSION_CODE, else (live manifest + 1).
VERSION_CODE="${2:-${VERSION_CODE:-}}"
if [[ -z "$VERSION_CODE" ]]; then
  CUR="$(curl -fsSL "$MANIFEST_URL?t=$(date +%s)" 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).versionCode||0))}catch{process.stdout.write('0')}})" 2>/dev/null || true)"
  if [[ -z "$CUR" || "$CUR" -lt 1 ]]; then
    echo "couldn't read current versionCode from $MANIFEST_URL — pass one explicitly:" >&2
    echo "  bash scripts/build-apk-local.sh \"$NOTES\" <versionCode>" >&2
    exit 1
  fi
  VERSION_CODE=$(( CUR + 1 ))
  echo "→ auto versionCode: ${CUR} (live) + 1 = ${VERSION_CODE}"
fi

echo "▶ Building Shinsa $VERSION (versionCode $VERSION_CODE) locally via gradle"

BG="$MOBILE_DIR/android/app/build.gradle"
[[ -f "$BG" ]] || { echo "android/ not prebuilt — run: (cd $MOBILE_DIR && npx expo prebuild -p android)" >&2; exit 1; }
sed -i '' -E "s/versionCode [0-9]+/versionCode $VERSION_CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" "$BG"

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export EXPO_PUBLIC_API_URL="$API_URL"

( cd "$MOBILE_DIR/android" && ./gradlew :app:assembleRelease --console=plain )

APK="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "build reported success but APK missing: $APK" >&2; exit 1; }

# Sanity: the APK must embed the versionCode we're about to advertise, or the
# in-app updater would loop (manifest says N, installed app reports != N).
AAPT="$(ls "$ANDROID_HOME"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
if [[ -x "$AAPT" ]]; then
  GOT_VC="$("$AAPT" dump badging "$APK" 2>/dev/null | sed -nE "s/.*versionCode='([0-9]+)'.*/\1/p" | head -1)"
  [[ "$GOT_VC" == "$VERSION_CODE" ]] || { echo "ABORT: built APK versionCode $GOT_VC != $VERSION_CODE" >&2; exit 1; }
fi
echo "✓ built $APK ($(( $(stat -f%z "$APK") / 1024 / 1024 )) MB, versionCode $VERSION_CODE)"

if [[ "${SKIP_PUBLISH:-0}" == "1" ]]; then
  echo "SKIP_PUBLISH=1 — not publishing. To publish:"
  echo "  bash $SCRIPT_DIR/release-apk.sh \"$APK\" $VERSION $VERSION_CODE \"$NOTES\""
  exit 0
fi

bash "$SCRIPT_DIR/release-apk.sh" "$APK" "$VERSION" "$VERSION_CODE" "$NOTES"
