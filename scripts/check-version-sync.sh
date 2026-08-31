#!/usr/bin/env bash
# check-version-sync.sh — fail if packages/pi-tools/package.json version != published npm version.
# Usage: scripts/check-version-sync.sh [--npm-view-cmd "npm view ..."] [package-dir]
# Override npm view for tests with: --npm-view-cmd 'echo 0.10.8'
set -euo pipefail

PKG_DIR="${2:-packages/pi-tools}"
NPM_VIEW="npm view @groeponline/pi-tools version"
if [[ "${1:-}" == "--npm-view-cmd" ]]; then
  NPM_VIEW="$2"
  PKG_DIR="${3:-packages/pi-tools}"
fi

PKG_JSON="$PKG_DIR/package.json"
if [[ ! -f "$PKG_JSON" ]]; then
  echo "check-version-sync: package.json not found at $PKG_JSON" >&2
  exit 2
fi

repo_version="$(python3 -c "import json,sys; print(json.load(open('$PKG_JSON'))['version'])")"
published="$(eval "$NPM_VIEW" 2>/dev/null || true)"

if [[ -z "$published" ]]; then
  echo "check-version-sync: cannot resolve published version (is npm reachable?)" >&2
  exit 2
fi

if [[ "$repo_version" != "$published" ]]; then
  echo "check-version-sync: VERSION DRIFT repo=$repo_version published=$published" >&2
  exit 1
fi

echo "check-version-sync: ok ($repo_version == npm $published)"