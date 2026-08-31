#!/usr/bin/env bash
# check-breaking-version.sh — fail when a breaking change is claimed without a major bump.
# Usage: scripts/check-breaking-version.sh [--package-version X] [--previous-version Y] [--change-log "text"] [--label semver:major]
#
# Rules (issue #13 gate G6, plan U6; "soft guard" per plan):
#   - No breaking marker in the change log -> ok.
#   - Previous major >= 1: require head major == previous major + 1 (1.4.0 -> 2.0.0 ok; 1.4.0 -> fail).
#   - Previous major == 0: breaking bumps the minor per 0.x convention (0.10 -> 0.11),
#     or jumps to 1.0; the `semver:major` label also satisfies the gate at 0.x.
#   - No previous version available (npm unreachable / no baseline): warn and pass —
#     the guard must not hard-fail a release it cannot judge.
# The label channel only exists on PR events; release jobs run on push/tag where it is
# always empty, so the version comparison (not the label) is the operative check there.
set -euo pipefail

PKG_VERSION=""
PREV_VERSION=""
CHANGE_LOG=""
LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-version) PKG_VERSION="$2"; shift 2 ;;
    --previous-version) PREV_VERSION="$2"; shift 2 ;;
    --change-log) CHANGE_LOG="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    *) echo "check-breaking-version: unknown arg $1" >&2; exit 64 ;;
  esac
done

if [[ -z "$PKG_VERSION" ]]; then
  PKG_VERSION="$(python3 -c "import json; print(json.load(open('packages/pi-tools/package.json'))['version'])")"
fi
if [[ -z "$PREV_VERSION" ]]; then
  PREV_VERSION="$(npm view @groeponline/pi-tools version 2>/dev/null || true)"
fi

# Detect a breaking-claim in the change log: conventional "breaking:" prefix or "BREAKING CHANGE".
is_breaking=""
if [[ -n "$CHANGE_LOG" ]] && printf '%s\n' "$CHANGE_LOG" | grep -qiE "^(breaking|break):|BREAKING CHANGE"; then
  is_breaking="yes"
fi

if [[ -z "$is_breaking" ]]; then
  echo "check-breaking-version: ok (no breaking claim)"
  exit 0
fi

if [[ -z "$PREV_VERSION" ]]; then
  echo "check-breaking-version: WARN — breaking change claimed but no baseline version (npm unreachable?); skipping hard gate" >&2
  exit 0
fi

major() { echo "${1%%\.*}"; }
minor() { local rest="${1#*.}"; echo "${rest%%\.*}"; }

prev_major="$(major "$PREV_VERSION")"
head_major="$(major "$PKG_VERSION")"
head_minor="$(minor "$PKG_VERSION")"

if [[ "$prev_major" != "0" ]]; then
  # Stable: a breaking change must land in the next major.
  if [[ "$head_major" -eq $((prev_major + 1)) ]]; then
    echo "check-breaking-version: ok (breaking change accompanied by major bump $PREV_VERSION -> $PKG_VERSION)"
    exit 0
  fi
  echo "check-breaking-version: FAIL — BREAKING change requires a major bump ($PREV_VERSION -> $PKG_VERSION)" >&2
  exit 1
fi

# Pre-1.0: breaking bumps the minor (0.x convention) or jumps to 1.0; label also passes.
if [[ "$LABEL" == "semver:major" || "$head_major" -gt 0 || "$head_minor" -gt "$(minor "$PREV_VERSION")" ]]; then
  echo "check-breaking-version: ok (pre-1.0 breaking change advanced minor/major $PREV_VERSION -> $PKG_VERSION)"
  exit 0
fi
echo "check-breaking-version: FAIL — BREAKING change claimed but version did not advance at 0.x ($PREV_VERSION -> $PKG_VERSION; add semver:major label or bump minor)" >&2
exit 1