#!/usr/bin/env bash
# check-breaking-version.sh — fail when a breaking change is claimed without a major bump.
# Usage: scripts/check-breaking-version.sh [--package-version X] [--change-log "text"] [--label semver:major]
# For CI: pass the PR description/changelog text and the package version; a "breaking:" /
# "BREAKING" claim without a `semver:major` label or major-version bump is a failure.
set -euo pipefail

PKG_VERSION=""
CHANGE_LOG=""
LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-version) PKG_VERSION="$2"; shift 2 ;;
    --change-log) CHANGE_LOG="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    *) echo "check-breaking-version: unknown arg $1" >&2; exit 64 ;;
  esac
done

if [[ -z "$PKG_VERSION" ]]; then
  PKG_VERSION="$(python3 -c "import json; print(json.load(open('packages/pi-tools/package.json'))['version'])")"
fi

# Detect a breaking-claim in the change log: conventional "breaking:" prefix or "BREAKING CHANGE".
is_breaking=""
if [[ -n "$CHANGE_LOG" ]] && printf '%s\n' "$CHANGE_LOG" | grep -qiE "^(breaking|break):|BREAKING CHANGE"; then
  is_breaking="yes"
fi

if [[ -n "$is_breaking" ]]; then
  major="${PKG_VERSION%%.*}"
  if [[ "$major" != "0" ]]; then
    echo "check-breaking-version: BREAKING change requires a major bump (current $PKG_VERSION major is already $major)" >&2
    exit 1
  fi
  if [[ "$LABEL" != "semver:major" ]]; then
    echo "check-breaking-version: FAIL — breaking change claimed but no 'semver:major' label and no major bump (version $PKG_VERSION)" >&2
    exit 1
  fi
  echo "check-breaking-version: ok (breaking change accompanied by semver:major label)"
  exit 0
fi

echo "check-breaking-version: ok (no breaking claim)"