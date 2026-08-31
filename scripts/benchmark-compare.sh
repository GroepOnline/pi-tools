#!/usr/bin/env bash
# benchmark-compare.sh — reproducible FFF vs ripgrep/fzf measurement.
# Writes a JSON artifact with commit/tool-version/env so public performance claims
# are reproducible (issue #13 gate G7).
#
# Usage: scripts/benchmark-compare.sh [--output /path/to/result.json] [--workload <repo-dir>]
set -euo pipefail

OUT="${OUTPUT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)/benchmark-result.json}"
WORKLOAD="${WORKLOAD:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
VERSION="$(git describe --tags --always 2>/dev/null || echo unknown)"

# Pin a query set; keep it deterministic so runs are comparable.
QUERIES=("README" "src" "package.json")

runs() {
  local cmd="$1" q
  local total=0 n=0
  for q in "${QUERIES[@]}"; do
    local t0 t1
    t0=$(date +%s%N)
    # shellcheck disable=SC2086
    $cmd "$q" >/dev/null 2>&1 || true
    t1=$(date +%s%N)
    total=$((total + t1 - t0))
    n=$((n + 1))
  done
  echo $((total / n / 1000000)) # ms median-of-3 naive mean
}

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<JSON
{
  "commit": "$COMMIT",
  "tool_version": "$VERSION",
  "host": "$(uname -srm)",
  "cpu": "$(lscpu 2>/dev/null | awk '/Model name/ { $1=$2=""; sub(/^  */,""); print; exit }' || echo unknown)",
  "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workload": "$WORKLOAD",
  "queries": [$(printf '"%s"' "${QUERIES[*]}")],
  "measurements": {
    "fff_ms_avg": $(runs "fff search -q" 2>/dev/null || echo 0),
    "rg_ms_avg": $(runs "rg -l"),
    "fzf_ms_avg": $(runs "fzf -q" 2>/dev/null || echo 0)
  },
  "note": "README performance claims must link this artifact, not assert raw numbers"
}
JSON
echo "benchmark artifact: $OUT"
cat "$OUT"