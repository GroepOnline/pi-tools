#!/usr/bin/env bash
# benchmark-compare.sh — reproducible FFF vs ripgrep/fzf measurement (issue #13 gate G7).
#
# Builds the shipped binary (fff-mcp, the only FFF binary in this repo) and measures an
# end-to-end MCP grep round-trip (agent-level latency, including index scan/warmup at
# startup), then compares with rg and non-interactive fzf --filter on the same query set.
# Writes a JSON artifact recording commit, tool version, env and a `found` map so a missing
# command can never masquerade as a fast result. Fails (exit 1) when a measured command is
# missing or errors, so the artifact is honest or the script is red.
#
# Usage: scripts/benchmark-compare.sh [--output /path/result.json] [--workload <repo-dir>] [--skip-fff]
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT="${OUTPUT:-$REPO/benchmark-result.json}"
WORKLOAD="${WORKLOAD:-$REPO}"
SKIP_FFF="${SKIP_FFF:-}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
VERSION="$(git describe --tags --always 2>/dev/null || echo unknown)"
CPU="$(lscpu 2>/dev/null | awk '/Model name/ { $1=$2=""; sub(/^  */,""); print; exit }' || sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) OUT="$2"; shift 2 ;;
    --workload) WORKLOAD="$2"; shift 2 ;;
    --skip-fff) SKIP_FFF=1; shift ;;
    *) echo "benchmark-compare: unknown arg $1" >&2; exit 64 ;;
  esac
done

command -v rg >/dev/null 2>&1 || { echo "benchmark-compare: rg not found (apt install ripgrep)" >&2; exit 1; }
command -v fzf >/dev/null 2>&1 || { echo "benchmark-compare: fzf not found (apt install fzf)" >&2; exit 1; }

# FFF binary must come from this repository so the recorded commit identifies the measured code.
FFF_CMD=""
if [[ -z "$SKIP_FFF" ]]; then
  echo "benchmark-compare: building repository fff-mcp (target/release/fff-mcp)..." >&2
  (cd "$REPO" && cargo build --release --bin fff-mcp) >&2
  FFF_CMD="$REPO/target/release/fff-mcp"
fi

# Workloads are reproducibility inputs: require a clean Git worktree and pin its full commit.
if ! WORKLOAD_REV="$(git -C "$WORKLOAD" rev-parse HEAD 2>/dev/null)"; then
  echo "benchmark-compare: workload must be a Git worktree with a pinned revision: $WORKLOAD" >&2
  exit 1
fi
if [[ -n "$(git -C "$WORKLOAD" status --porcelain --untracked-files=normal)" ]]; then
  echo "benchmark-compare: workload must be clean so revision $WORKLOAD_REV identifies its contents" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

export BENCH_OUT="$OUT" BENCH_WORKLOAD="$WORKLOAD" BENCH_WORKLOAD_REV="$WORKLOAD_REV" BENCH_COMMIT="$COMMIT" BENCH_VERSION="$VERSION" \
  BENCH_CPU="$CPU" BENCH_FFF_CMD="$FFF_CMD" BENCH_SKIP_FFF="$SKIP_FFF"

python3 - <<'PY'
import json
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone

out = os.environ["BENCH_OUT"]
workload = os.environ["BENCH_WORKLOAD"]
workload_rev = os.environ["BENCH_WORKLOAD_REV"]
commit = os.environ["BENCH_COMMIT"]
version = os.environ["BENCH_VERSION"]
cpu = os.environ["BENCH_CPU"]
fff_cmd = os.environ["BENCH_FFF_CMD"]

QUERIES = ["README", "src", "package.json"]
SAMPLES = 3
TIMEOUT = 120


def mcp_request(ident, method, params):
    return json.dumps({"jsonrpc": "2.0", "id": ident, "method": method, "params": params})


def fff_batch(q):
    """Minimal MCP stdio batch: initialize + initialized + one tools/call grep."""
    return (
        mcp_request(1, "initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "benchmark-compare", "version": "1"},
        })
        + "\n" + json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        + mcp_request(2, "tools/call", {"name": "grep", "arguments": {"pattern": q}})
    ).encode()


def timed_samples(argv, stdin):
    """3 samples of one command; RuntimeError on missing binary/timeout/nonzero."""
    samples = []
    for _ in range(SAMPLES):
        t0 = time.perf_counter()
        try:
            result = subprocess.run(argv, input=stdin, cwd=workload, timeout=TIMEOUT,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode != 0:
                raise RuntimeError(f"{argv[0]} exited {result.returncode}")
        except (subprocess.TimeoutExpired, OSError) as e:
            raise RuntimeError(f"{argv[0]}: {e}")
        samples.append((time.perf_counter() - t0) * 1000.0)
    return samples


def measure(label, build):
    """build(q) -> (argv, stdin); one entry per query."""
    samples, ok = [], True
    for q in QUERIES:
        try:
            samples += timed_samples(*build(q))
        except RuntimeError as e:
            ok = False
            print(f"benchmark-compare: {label} failed on {q!r}: {e}", file=sys.stderr)
    return {
        "found": ok,
        "ok": ok,
        "avg_ms": round(sum(samples) / len(samples), 1) if samples else 0.0,
        "samples_ms": [round(s, 1) for s in samples],
    }


def fff_build(q):
    return [fff_cmd, "--no-update-check"], fff_batch(q)


def rg_build(q):
    return ["rg", "-l", "--no-messages", q], None


# fzf leg needs a stable file listing as its search space (non-interactive --filter).
listing_result = subprocess.run(["rg", "--files"], cwd=workload, timeout=60, capture_output=True)
if listing_result.returncode != 0:
    raise RuntimeError(f"rg --files exited {listing_result.returncode}")
listing = listing_result.stdout


def fzf_build(q):
    return ["fzf", "--filter", q], listing


measurements = {
    "fff_mcp_grep_ms_avg": measure("fff", fff_build) if fff_cmd else {
        "found": False, "ok": False, "avg_ms": 0.0, "samples_ms": [],
        "skipped": "no fff binary / --skip-fff",
    },
    "rg_ms_avg": measure("rg", rg_build),
    "fzf_ms_avg": measure("fzf", fzf_build),
}

artifact = {
    "commit": commit,
    "tool_version": version,
    "host": platform.system() + " " + platform.release(),
    "cpu": cpu,
    "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "workload": workload,
    "workload_revision": workload_rev,
    "queries": QUERIES,
    "found": {k.removesuffix("_ms_avg"): v["found"] for k, v in measurements.items()},
    "measurements": {k: v["avg_ms"] for k, v in measurements.items()},
    "note": "fff leg = end-to-end MCP tools/call grep round-trip incl. index scan; rg/fzf = CLI search on identical queries. Artifact must be linked for README performance claims.",
}

with open(out, "w") as f:
    json.dump(artifact, f, indent=2)
    f.write("\n")

# Self-check (plan TS-13): required keys exist and rg/fzf were really measured.
required = ["commit", "tool_version", "workload_revision", "queries", "measurements"]
missing = [k for k in required if k not in artifact]
if missing:
    print(f"benchmark-compare: artifact missing keys {missing}", file=sys.stderr)
    sys.exit(1)

failed = []
for label in ("rg", "fzf"):
    m = measurements[f"{label}_ms_avg"]
    if not m["ok"] or not m["found"]:
        failed.append(f"{label} measurement failed")
    elif m["avg_ms"] <= 0:
        failed.append(f"{label} produced zero measurements (check workload)")
fff_m = measurements["fff_mcp_grep_ms_avg"]
if fff_cmd and not fff_m["ok"]:
    failed.append("fff measurement failed (build error or MCP probe error)")
if failed:
    print(f"benchmark-compare: FAIL — {', '.join(failed)}; artifact written but unusable", file=sys.stderr)
    sys.exit(1)

print("benchmark artifact:", out)
for k, v in measurements.items():
    print(f"  {k}: {v['avg_ms']} ms (found={v['found']})")
PY
cat "$OUT"