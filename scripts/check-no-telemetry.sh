#!/usr/bin/env bash
# check-no-telemetry.sh — fail if the pi-tools extension source makes network calls.
# Local-only boundary: no fetch/http/net in extension src (metadata doc/asset URLs allowed).
set -euo pipefail

SRC="${1:-packages/pi-tools/src}"
FIXTURE="${2:-}"

# Network API surface: fetch(, XMLHttpRequest, http:// or https:// used as a URL literal,
# net. module, WebSocket. HTTPS URLs in comments/strings that are not runtime calls should
# be listed in the allowlist below with a reason.
ALLOWLIST=(
  "https://pi.dev/docs/latest/packages"   # package metadata doc link (verify-pi-package-contract.mjs DOCS const)
  "https://raw.githubusercontent.com"     # pi.image asset URL in package.json (gallery)
  "https://github.com"                    # repository/homepage metadata
)

hits="$(grep -rnE "fetch\(|XMLHttpRequest|WebSocket|https?://|net\." "$SRC" 2>/dev/null || true)"

if [[ -n "$FIXTURE" ]]; then
  hits="$(printf '%s\n' "$FIXTURE")"
fi

violations=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  allowed=0
  for a in "${ALLOWLIST[@]}"; do
    if [[ "$line" == *"$a"* ]]; then allowed=1; break; fi
  done
  if [[ "$allowed" -eq 0 ]]; then
    echo "check-no-telemetry: network surface in ext src: $line" >&2
    violations=$((violations + 1))
  fi
done <<< "$hits"

if [[ "$violations" -gt 0 ]]; then
  echo "check-no-telemetry: FAIL ($violations hit(s) outside allowlist — local-only boundary violated)" >&2
  exit 1
fi
echo "check-no-telemetry: ok (no network surface outside allowlist)"