#!/usr/bin/env bash
# Zoek in Pi sessie-logs (JSONL) voor fouten, modellen, providers
# Gebruik: bash scripts/search-pi-logs.sh [opties]
#   --zoekterm "term"    Filter op tekst
#   --type error|user|all
#   --model glm          Filter op model (regex)
#   --provider zai       Filter op provider (regex)
set -euo pipefail

SESSION_DIR="${PI_SESSION_DIR:-$HOME/.pi/agent/sessions}"
ZOEKTERM=""
TYPE_VAL="all"
MODEL_FILTER=""
PROVIDER_FILTER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --zoekterm|-z) ZOEKTERM="$2"; shift 2;;
        --type|-t) TYPE_VAL="$2"; shift 2;;
        --model|-m) MODEL_FILTER="$2"; shift 2;;
        --provider|-p) PROVIDER_FILTER="$2"; shift 2;;
        --help|-h)
            echo "Usage: $0 [--zoekterm term] [--type error|user|all] [--model glm] [--provider zai]"
            exit 0;;
        *) ZOEKTERM="$1"; shift;;
    esac
done

find "$SESSION_DIR" -name "*.jsonl" -exec cat {} + 2>/dev/null | \
    jq -r --arg zt "$ZOEKTERM" --arg tp "$TYPE_VAL" --arg mf "$MODEL_FILTER" --arg pf "$PROVIDER_FILTER" '
    select(
        ($tp == "all") or
        ($tp == "error" and .message.stopReason == "error") or
        ($tp == "user" and .message.role == "user")
    )
    | select(
        ($mf == "") or (.message.model // "" | test($mf; "i"))
    )
    | select(
        ($pf == "") or (.message.provider // "" | test($pf; "i"))
    )
    | select(
        ($zt == "") or
        (.message.errorMessage // "" | test($zt; "i")) or
        (.message.content // [] | map(select(.type == "text") | .text) | join(" ") | test($zt; "i"))
    )
    | {
        ts: .timestamp[0:19],
        model: (.message.model // "-"),
        provider: (.message.provider // "-"),
        role: .message.role,
        error: (.message.errorMessage // ""),
        stop: (.message.stopReason // ""),
        text: (.message.content // [] | map(select(.type == "text") | .text[0:120]) | join(" ") | .[0:120])
    }
    | "\(.ts) | \(.model) | \(.provider) | \(.role) | \(.stop) \(.error) | \(.text)"
' | sort | if [ -n "$ZOEKTERM" ]; then fzf --filter "$ZOEKTERM" --no-sort; else cat; fi
