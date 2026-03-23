#!/usr/bin/env bash

set -e

VSCODE_QUALITY="${VSCODE_QUALITY:-stable}"

# Read pinned commit from upstream/stable.json
if [[ -z "${MS_COMMIT}" ]]; then
  if [[ ! -f "./upstream/${VSCODE_QUALITY}.json" ]]; then
    echo "Error: ./upstream/${VSCODE_QUALITY}.json not found"
    exit 1
  fi

  MS_COMMIT=$( jq -r '.commit' "./upstream/${VSCODE_QUALITY}.json" )
  MS_TAG=$( jq -r '.tag' "./upstream/${VSCODE_QUALITY}.json" )
fi

if [[ -z "${MS_COMMIT}" || "${MS_COMMIT}" == "null" ]]; then
  echo "Error: No commit found in upstream/${VSCODE_QUALITY}.json"
  exit 1
fi

echo "MS_TAG=\"${MS_TAG}\""
echo "MS_COMMIT=\"${MS_COMMIT}\""

# Compute RELEASE_VERSION
if [[ -z "${RELEASE_VERSION}" ]]; then
  TIME_PATCH=$( printf "%04d" $(( $(date +%-j) * 24 + $(date +%-H) )) )
  RELEASE_VERSION="${MS_TAG}${TIME_PATCH}"
fi

echo "RELEASE_VERSION=\"${RELEASE_VERSION}\""

# Shallow clone into vscode/
rm -rf vscode
mkdir -p vscode
cd vscode

git init -q
git remote add origin https://github.com/Microsoft/vscode.git
git fetch --depth 1 origin "${MS_COMMIT}"
git checkout FETCH_HEAD

cd ..

# Export for downstream scripts and GH Actions
if [[ -n "${GITHUB_ENV}" ]]; then
  echo "MS_TAG=${MS_TAG}" >> "${GITHUB_ENV}"
  echo "MS_COMMIT=${MS_COMMIT}" >> "${GITHUB_ENV}"
  echo "RELEASE_VERSION=${RELEASE_VERSION}" >> "${GITHUB_ENV}"
fi

export MS_TAG
export MS_COMMIT
export RELEASE_VERSION
