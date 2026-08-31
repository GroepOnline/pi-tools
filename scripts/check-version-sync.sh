#!/usr/bin/env bash
# check-version-sync.sh — fail if packages/pi-tools/package.json version != published npm version.
# Usage: scripts/check-version-sync.sh [package-dir] [--npm-view-cmd "npm view ..."]
# Override npm view for tests with: --npm-view-cmd 'echo 0.10.8'
# Intentional release transitions (bump commit before npm publish) can override:
#   PI_TOOLS_ALLOW_DRIFT=1 scripts/check-version-sync.sh
set -euo pipefail

NPM_VIEW="npm view @groeponline/pi-tools version"
PKG_DIR="packages/pi-tools"

if [[ $# -ge 1 && "$1" == "--npm-view-cmd" ]]; then
  NPM_VIEW="$2"
  PKG_DIR="${3:-packages/pi-tools}"
elif [[ $# -ge 1 && "$1" != "--npm-view-cmd" ]]; then
  PKG_DIR="$1"
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
  if [[ "${PI_TOOLS_ALLOW_DRIFT:-}" == "1" ]]; then
    echo "check-version-sync: OVERRIDE — version drift allowed (release window): repo=$repo_version published=$published" >&2
    exit 0
  fi
  echo "check-version-sync: VERSION DRIFT repo=$repo_version published=$published" >&2
  exit 1
fi

echo "check-version-sync: ok ($repo_version == npm $published)"