#!/usr/bin/env bash

# --- Wintermute identity ---
APP_NAME="${APP_NAME:-Wintermute}"
APP_NAME_LC="$( echo "${APP_NAME}" | awk '{print tolower($0)}' )"
ASSETS_REPOSITORY="${ASSETS_REPOSITORY:-Auda29/wntrmte}"
BINARY_NAME="${BINARY_NAME:-wntrmte}"
GH_REPO_PATH="${GH_REPO_PATH:-Auda29/wntrmte}"
ORG_NAME="${ORG_NAME:-Wintermute}"
GLOBAL_DIRNAME="${GLOBAL_DIRNAME:-"${APP_NAME_LC}"}"

# --- Helpers ---
exists() { type -t "$1" &> /dev/null; }

is_gnu_sed() {
  sed --version &> /dev/null
}

replace() {
  if is_gnu_sed; then
    sed -i -E "${1}" "${2}"
  else
    sed -i '' -E "${1}" "${2}"
  fi
}

if ! exists gsed; then
  if is_gnu_sed; then
    function gsed() { sed -i -E "$@"; }
  else
    function gsed() { sed -i '' -E "$@"; }
  fi
fi

# --- Patch application ---
# Replaces !!PLACEHOLDER!! tokens in a .patch file, then applies it via git apply.
apply_patch() {
  if [[ -z "$2" ]]; then
    echo "applying patch: $1"
  fi

  cp "$1"{,.bak}

  replace "s|!!APP_NAME!!|${APP_NAME}|g" "$1"
  replace "s|!!APP_NAME_LC!!|${APP_NAME_LC}|g" "$1"
  replace "s|!!BINARY_NAME!!|${BINARY_NAME}|g" "$1"
  replace "s|!!GH_REPO_PATH!!|${GH_REPO_PATH}|g" "$1"
  replace "s|!!GLOBAL_DIRNAME!!|${GLOBAL_DIRNAME}|g" "$1"
  replace "s|!!ORG_NAME!!|${ORG_NAME}|g" "$1"
  replace "s|!!RELEASE_VERSION!!|${RELEASE_VERSION}|g" "$1"

  if ! git apply --ignore-whitespace "$1"; then
    echo "failed to apply patch: $1" >&2
    exit 1
  fi

  mv -f "$1"{.bak,}
}
