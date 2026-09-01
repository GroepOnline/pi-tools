#!/usr/bin/env bash
# check-no-telemetry.sh — fail if the pi-tools extension source makes network calls.
# Local-only boundary: no fetch/http/net in extension src (metadata doc/asset URLs allowed).
set -euo pipefail

SRC="${1:-packages/pi-tools/src}"
FIXTURE="${2:-}"

# Network API surface: fetch(, XMLHttpRequest, WebSocket, node:http/https/net imports,
# option-object http.get/http.request, Bun.connect, createServer, and https?:// URL literals.
# Any matching runtime/source line is rejected; metadata URLs outside src are verified separately.
PATTERNS='fetch\(|XMLHttpRequest|WebSocket|node:(http|https|net)|Bun\.connect|https?\.(get|request)|createServer|https?://'


hits="$(grep -rnE "$PATTERNS" "$SRC" 2>/dev/null || true)"

if [[ -n "$FIXTURE" ]]; then
  hits="$(printf '%s\n' "$FIXTURE")"
fi

violations=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  echo "check-no-telemetry: network surface in ext src: $line" >&2
  violations=$((violations + 1))
done <<< "$hits"

if [[ "$violations" -gt 0 ]]; then
  echo "check-no-telemetry: FAIL ($violations hit(s) outside allowlist — local-only boundary violated)" >&2
  exit 1
fi
echo "check-no-telemetry: ok (no network surface outside allowlist)"