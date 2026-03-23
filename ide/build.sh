#!/usr/bin/env bash
# shellcheck disable=SC1091

set -ex

# --- Shared branding helpers ---
. utils.sh

# --- Resolve OS_NAME ---
if [[ -z "${OS_NAME}" ]]; then
  case "$(uname -s)" in
    Linux*)                       OS_NAME="linux" ;;
    Darwin*)                      OS_NAME="osx" ;;
    MINGW*|MSYS*|CYGWIN*)         OS_NAME="windows" ;;
    *)  echo "Unknown OS: $(uname -s)"; exit 1 ;;
  esac
fi
export OS_NAME

# --- Resolve VSCODE_ARCH ---
if [[ -z "${VSCODE_ARCH}" ]]; then
  case "$(uname -m)" in
    x86_64|amd64)   VSCODE_ARCH="x64" ;;
    aarch64|arm64)  VSCODE_ARCH="arm64" ;;
    armv7l)         VSCODE_ARCH="armhf" ;;
    *)  echo "Unknown arch: $(uname -m)"; exit 1 ;;
  esac
fi
export VSCODE_ARCH

echo "=== Wintermute Build ==="
echo "OS_NAME=${OS_NAME} VSCODE_ARCH=${VSCODE_ARCH}"

# --- Clone VS Code ---
. get_repo.sh

# --- BUILD_SOURCEVERSION (embedded in About dialog) ---
if [[ -z "${BUILD_SOURCEVERSION}" ]]; then
  if exists sha1sum; then
    BUILD_SOURCEVERSION=$( echo "${RELEASE_VERSION}" | sha1sum | cut -d' ' -f1 )
  else
    BUILD_SOURCEVERSION=$( echo "${RELEASE_VERSION}" | shasum -a 1 | cut -d' ' -f1 )
  fi
fi
export BUILD_SOURCEVERSION
echo "BUILD_SOURCEVERSION=\"${BUILD_SOURCEVERSION}\""

# --- Prepare (product.json merge, patches, npm ci) ---
. prepare_vscode.sh

# --- Build ---
cd vscode

export NODE_OPTIONS="--max-old-space-size=8192"

npm run gulp compile-build-without-mangling
npm run gulp compile-extension-media
npm run gulp compile-extensions-build
npm run gulp minify-vscode

if [[ "${OS_NAME}" == "osx" ]]; then
  npm run gulp "vscode-darwin-${VSCODE_ARCH}-min-ci"
elif [[ "${OS_NAME}" == "windows" ]]; then
  npm run gulp "vscode-win32-${VSCODE_ARCH}-min-ci"
else
  npm run gulp "vscode-linux-${VSCODE_ARCH}-min-ci"
fi

# --- Post-process packaged branding quirks ---
if [[ "${OS_NAME}" == "windows" ]]; then
  output_dir="VSCode-win32-${VSCODE_ARCH}"
  manifest_path="$(find "${output_dir}" -maxdepth 1 -name '*.VisualElementsManifest.xml' | head -n 1)"

  if [[ -n "${manifest_path}" && -f "${manifest_path}" ]]; then
    echo "=== Updating Windows VisualElements manifest branding ==="
    replace "s|ShortDisplayName=\"[^\"]+\"|ShortDisplayName=\"${APP_NAME}\"|g" "${manifest_path}"
  fi

  unset manifest_path
  unset output_dir
fi

cd ..

echo ""
echo "=== Build complete ==="
if [[ "${OS_NAME}" == "osx" ]]; then
  echo "Output: VSCode-darwin-${VSCODE_ARCH}/"
elif [[ "${OS_NAME}" == "windows" ]]; then
  echo "Output: VSCode-win32-${VSCODE_ARCH}/"
else
  echo "Output: VSCode-linux-${VSCODE_ARCH}/"
fi
