#!/usr/bin/env bash
# shellcheck disable=SC1091

set -e

cd vscode || { echo "'vscode' dir not found"; exit 1; }

# --- Merge product.json ---
# VS Code's product.json is the base; ours overrides specific keys.
jsonTmp=$( jq -s '.[0] * .[1]' product.json ../product.json )
echo "${jsonTmp}" > product.json
unset jsonTmp

echo "=== Merged product.json ==="

# --- Source utils for apply_patch ---
. ../utils.sh

echo "APP_NAME=\"${APP_NAME}\""
echo "BINARY_NAME=\"${BINARY_NAME}\""

# --- Copy icons ---
if [[ -d "../icons" ]]; then
  echo "=== Copying icons ==="

  # Windows
  if [[ -f "../icons/wntrmte.ico" ]]; then
    cp ../icons/wntrmte.ico resources/win32/code.ico
  fi

  # Linux
  if [[ -f "../icons/wntrmte_128x128.png" ]]; then
    cp ../icons/wntrmte_128x128.png resources/linux/code.png
  fi
  if [[ -f "../icons/wntrmte_512x512.png" ]]; then
    cp ../icons/wntrmte_512x512.png resources/linux/rpm/code.png 2>/dev/null || true
  fi

  # macOS â€” generate .icns via iconutil if available, or use pre-built
  if [[ -f "../icons/wntrmte.icns" ]]; then
    cp ../icons/wntrmte.icns resources/darwin/code.icns
  elif command -v iconutil &>/dev/null && [[ -f "../icons/wntrmte_1024x1024.png" ]]; then
    echo "=== Generating macOS .icns via iconutil ==="
    _iconset="../icons/wntrmte.iconset"
    mkdir -p "${_iconset}"
    sips -z 16 16     ../icons/wntrmte_1024x1024.png --out "${_iconset}/icon_16x16.png"    2>/dev/null
    sips -z 32 32     ../icons/wntrmte_1024x1024.png --out "${_iconset}/icon_16x16@2x.png" 2>/dev/null
    sips -z 32 32     ../icons/wntrmte_1024x1024.png --out "${_iconset}/icon_32x32.png"    2>/dev/null
    sips -z 64 64     ../icons/wntrmte_1024x1024.png --out "${_iconset}/icon_32x32@2x.png" 2>/dev/null
    sips -z 128 128   ../icons/wntrmte_128x128.png   --out "${_iconset}/icon_128x128.png"   2>/dev/null
    sips -z 256 256   ../icons/wntrmte_256x256.png   --out "${_iconset}/icon_128x128@2x.png" 2>/dev/null
    sips -z 256 256   ../icons/wntrmte_256x256.png   --out "${_iconset}/icon_256x256.png"   2>/dev/null
    sips -z 512 512   ../icons/wntrmte_512x512.png   --out "${_iconset}/icon_256x256@2x.png" 2>/dev/null
    cp ../icons/wntrmte_512x512.png   "${_iconset}/icon_512x512.png"
    cp ../icons/wntrmte_1024x1024.png "${_iconset}/icon_512x512@2x.png"
    iconutil -c icns "${_iconset}" -o ../icons/wntrmte.icns
    cp ../icons/wntrmte.icns resources/darwin/code.icns
    rm -rf "${_iconset}"
    unset _iconset
  fi
fi

# --- Build and bundle wntrmte-workflow extension ---
if [[ -d "../extensions/wntrmte-workflow" ]]; then
  echo "=== Building wntrmte-workflow extension ==="
  (cd ../extensions/wntrmte-workflow && npm ci && npm run compile)
  rm -rf extensions/wntrmte-workflow
  mkdir -p extensions/wntrmte-workflow
  cp    ../extensions/wntrmte-workflow/package.json extensions/wntrmte-workflow/
  cp -r ../extensions/wntrmte-workflow/out          extensions/wntrmte-workflow/out
fi

# --- Bundle wntrmte-theme extension ---
if [[ -d "../extensions/wntrmte-theme" ]]; then
  echo "=== Bundling wntrmte-theme extension ==="
  rm -rf extensions/wntrmte-theme
  mkdir -p extensions/wntrmte-theme
  cp    ../extensions/wntrmte-theme/package.json     extensions/wntrmte-theme/
  cp    ../extensions/wntrmte-theme/package.nls.json extensions/wntrmte-theme/
  cp -r ../extensions/wntrmte-theme/themes           extensions/wntrmte-theme/themes
fi

# --- Apply patches ---
# Core patches
for file in ../patches/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done

# OS-specific patches
if [[ -d "../patches/${OS_NAME}/" ]]; then
  for file in "../patches/${OS_NAME}/"*.patch; do
    if [[ -f "${file}" ]]; then
      apply_patch "${file}"
    fi
  done
fi

# User-local patches (gitignored)
for file in ../patches/user/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done

# --- Install dependencies ---
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [[ -f ../npmrc ]]; then
  cat ../npmrc >> .npmrc
fi

for i in {1..5}; do
  npm ci && break

  if [[ $i == 5 ]]; then
    echo "npm ci failed after 5 attempts" >&2
    exit 1
  fi
  echo "npm ci failed (attempt $i), retrying..."
  sleep $(( 15 * (i + 1) ))
done


cd ..