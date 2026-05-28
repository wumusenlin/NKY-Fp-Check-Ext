#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
BUILD_DIR="$DIST_DIR/extension-src"
KEY_FILE="${KEY_FILE:-}"
CHROME_BIN="${CHROME_BIN:-}"
PREPARE_ONLY=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/pack-crx.sh [--key path/to/extension.pem] [--chrome path/to/chrome] [--prepare-only]

Environment variables:
  KEY_FILE    Existing PEM key. Keep using the same PEM to keep the extension ID stable.
  CHROME_BIN  Chrome executable path.

Examples:
  scripts/pack-crx.sh
  scripts/pack-crx.sh --key secrets/nky-fp-check.pem
  CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" scripts/pack-crx.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key)
      KEY_FILE="${2:-}"
      shift 2
      ;;
    --chrome)
      CHROME_BIN="${2:-}"
      shift 2
      ;;
    --prepare-only)
      PREPARE_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

find_chrome() {
  if [[ -n "$CHROME_BIN" ]]; then
    printf '%s\n' "$CHROME_BIN"
    return
  fi

  local candidates=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    "google-chrome"
    "google-chrome-stable"
    "chromium"
    "chromium-browser"
    "chrome"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ "$candidate" == /* && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
    if [[ "$candidate" != /* ]] && command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done

  echo "Chrome executable not found. Pass --chrome or CHROME_BIN." >&2
  exit 1
}

copy_file() {
  local source="$1"
  local target="$BUILD_DIR/$source"

  if [[ ! -f "$ROOT_DIR/$source" ]]; then
    echo "Missing required file: $source" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$target")"
  cp "$ROOT_DIR/$source" "$target"
}

version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT_DIR/manifest.json" | head -n 1)"
if [[ -z "$version" ]]; then
  echo "Could not read version from manifest.json." >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

required_files=(
  "manifest.json"
  "background.js"
  "content.js"
  "icons/icon-128.png"
  "neikongyi-bridge.js"
  "popup.html"
  "popup.js"
  "styles.css"
  "vendor/html2canvas.min.js"
)

for file in "${required_files[@]}"; do
  copy_file "$file"
done

echo "Prepared extension source: $BUILD_DIR"

if [[ "$PREPARE_ONLY" -eq 1 ]]; then
  echo "Prepare-only mode complete."
  exit 0
fi

chrome="$(find_chrome)"
pack_args=(--pack-extension="$BUILD_DIR")

if [[ -n "$KEY_FILE" ]]; then
  if [[ ! -f "$KEY_FILE" ]]; then
    echo "PEM key not found: $KEY_FILE" >&2
    exit 1
  fi
  pack_args+=(--pack-extension-key="$KEY_FILE")
else
  echo "No PEM key provided. Chrome will create a new key; save it for future updates."
fi

"$chrome" "${pack_args[@]}"

crx_source="$DIST_DIR/extension-src.crx"
pem_source="$DIST_DIR/extension-src.pem"
crx_target="$DIST_DIR/nky-fp-check-ext-v$version.crx"
pem_target="$DIST_DIR/nky-fp-check-ext-v$version.pem"

if [[ -f "$crx_source" ]]; then
  mv "$crx_source" "$crx_target"
fi

if [[ -f "$pem_source" ]]; then
  mv "$pem_source" "$pem_target"
  echo "Generated PEM key: $pem_target"
  echo "Keep this PEM private. Use it for every future release."
fi

if [[ -f "$crx_target" ]]; then
  echo "Generated CRX: $crx_target"
else
  echo "Chrome did not produce expected CRX: $crx_source" >&2
  exit 1
fi
