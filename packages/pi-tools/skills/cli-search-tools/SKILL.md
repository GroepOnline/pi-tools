---
name: cli-search-tools
description: Power-user search, filter, and analysis toolkit for the terminal. Covers ripgrep (rg), fzf, jq, awk, sed, grep, find, xargs, and pipe compositions for log analysis, code exploration, data wrangling, and fuzzy finding. Use when the agent needs to search files, filter output, parse logs, extract structured data, or compose complex shell pipelines. Includes non-interactive fzf (--filter, --query), rg with JSON output, jq queries, and awk one-liners.
---

# CLI Search & Filter Tools

> Merged from `@groeponline/pi-cli-search-tools` (archived). This skill now ships
> with `@groeponline/pi-tools`. Prefer the FFF-backed extension tools
> (`fff_find`, `fff_grep`, `tgrep`, `@`-completion) for file/content search inside
> a project — they reuse one resident index instead of spawning a process per
> query. Use the CLI recipes below when FFF tools are unavailable, for log
> analysis, JSON wrangling (`jq`), and one-off shell pipelines.

Reference and workflow guide for ripgrep, fzf, jq, awk, sed, grep, find, and pipe compositions. Everything here is designed for **non-interactive agent use** (piped commands, `fzf --filter`, `rg --json`, `jq` queries) as well as interactive patterns the agent can suggest to the user.

## Quick Reference

### ripgrep (rg)

```bash
# Zoek in bestanden (default: recursief, gitignore-respecterend)
rg "pattern" .

# Case-insensitive
rg -i "error" .

# Zoek in specifiek bestandstype
rg -t js "useState" .
rg -t py "import" .
rg -t md "TODO" .

# JSON output (ideaal voor pipen naar jq)
rg -j "error" . --json | jq -r '.data.path.text + ":" + (.data.line_number|tostring) + ": " + .data.lines.text'

# Zoek met context (3 regels voor/na)
rg -C3 "Error" server.log

# Zoek en tel per bestand
rg -c "error" . --sort path

# Zoek maar toon alleen bestandsnamen
rg -l "deprecated" .

# Zoek met regex groups
rg -oP '(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})' logs/

# Zoek in bestandsnamen
rg --files | rg "\.config$"

# Negatieve lookaround (Python-regex)
rg "(?!#)TODO" .  # TODO's niet na #
```

### fzf (non-interactive / agent-gebruik)

```bash
# Filter lijst op zoekterm (GEEN interactive mode nodig!)
echo -e "appel\nboom\ncitroen\nbanaan" | fzf --filter "app"
# Resultaat: appel

# Filter door bestandslijst
find . -name "*.ts" | fzf --filter "config"

# Filter met preview
ls *.log | fzf --filter "error" --preview "head -20 {}"

# Query mode (filter + sort)
rg -l "error" . | fzf --query "server" --no-sort

# fzf gebruiken voor keuzes in scripts (met --height voor terminal)
cat data.txt | fzf --multi --height=40% --header="Select lines"

# fzf met field delimiter en nth-filter
ps aux | fzf --delimiter=' ' --nth=1,2,11 --filter "nginx"
```

### jq

```bash
# Basis: key selecteren
echo '{"name":"test","value":42}' | jq '.name'

# Array filteren
echo '[{"a":1},{"a":2},{"a":3}]' | jq '.[] | select(.a > 1)'

# Nested JSON uitlezen
cat data.json | jq '.users[] | {name: .profile.name, email: .emails[0].address}'

# JSONL (newline-delimited JSON) verwerken
cat sessions.jsonl | jq -c 'select(.type == "message") | {ts: .timestamp, role: .message.role}'

# Samenvatten
cat data.json | jq 'group_by(.status) | map({status: .[0].status, count: length})'

# CSV naar JSON
cat data.csv | jq -R -s 'split("\n") | map(split(",")) | .[0] as $h | .[1:] | map(zip($h | map(.) | .[]))'

# JSONL fouten filteren
cat log.jsonl | jq -c 'select(.message.errorMessage != null) | {ts: .timestamp, model: .message.model, err: .message.errorMessage}'
```

### awk

```bash
# Kolom printen
awk '{print $1, $4}' data.txt

# Voorwaardelijk filteren
awk '$3 > 100 {print $0}' data.txt

# Regel nummeren
awk '{print NR": "$0}' file.txt

# Delimiter instellen (bijv. pipe-separated)
awk -F'|' '{print $1, $3}' data.psv

# Samenvoegen met separator
awk '{printf "%s;", $0}' file.txt

# Kolommen tellen per groep
awk '{count[$1]++} END {for (k in count) print k, count[k]}' access.log

# Tijd-format omzetting (epoch naar leesbaar)
awk '{print strftime("%Y-%m-%d %H:%M", $1)}' timestamps.txt
```

### Pipe-combinaties (praktijkvoorbeelden)

```bash
# Zoek iedere fout in JSONL logs en groepeer per model
cat ~/.pi/agent/sessions/**/*.jsonl | \
  jq -c 'select(.message.stopReason == "error") | .message.model' | \
  sort | uniq -c | sort -rn

# Zoek fouten en toon met context via rg + fzf
rg -l "error" /var/log/ | \
  fzf --filter "nginx" | \
  xargs -I{} rg -C2 "error" {}

# Log analyseer-pipeline: filter, tel, sorteer
rg "HTTP" access.log | \
  awk '{print $9}' | \
  sort | uniq -c | sort -rn | \
  head -20

# JSONL sessie-logs: unieke modellen met fout-count
find ~/.pi/agent/sessions -name "*.jsonl" -exec cat {} + | \
  jq -r 'select(.message.stopReason == "error") | .message.model' | \
  sort | uniq -c | sort -rn

# Bestanden zoeken met find + filteren met fzf + preview
find . -name "*.ts" -o -name "*.js" | \
  fzf --filter "config" --preview "head -5 {}"

# rg JSON output naar jq: iedere "TODO" in TypeScript met pad + regelnummer
rg -t ts "TODO" . --json | \
  jq -r '"\(.data.path.text):\(.data.line_number): \(.data.lines.text | trim)"'

# Log errors met tijdlijn via awk
rg "ERROR" app.log | \
  awk -F'[' '{print $2}' | \
  awk '{print substr($0,1,10)}' | \
  uniq -c
```

## Gebruik per taak

### Taak: "Zoek iedere fout in deze logs"
```bash
rg -i "error|exception|fatal" logs/ -C2
# Of voor JSONL:
cat *.jsonl | jq -c 'select(.message.errorMessage != null)'
```

### Taak: "Filter deze output op een term"
```bash
# Non-interactive:
command | fzf --filter "zoekterm"
# Of simpeler:
command | grep "zoekterm"
```

### Taak: "Parseer JSON data"
```bash
cat data.json | jq '.items[] | {name, status}'
cat data.jsonl | jq -c 'select(.type == "error")'
```

### Taak: "Groepeer en tel"
```bash
# Per kolom:
awk '{print $1}' data.txt | sort | uniq -c | sort -rn
# Per JSON veld:
cat data.jsonl | jq -r '.model' | sort | uniq -c | sort -rn
```

### Taak: "Zoek in bestandsnamen"
```bash
find . -name "*config*" -type f
# Of:
rg --files | rg "config"
```

### Taak: "Samengestelde pipeline maken"
```bash
# 1: verzamel, 2: filter, 3: transform, 4: toon
find . -name "*.log" -exec rg -l "ERROR" {} + | \
  fzf --filter "server" | \
  xargs -I{} rg --no-line-number "ERROR" {} | \
  awk '{print $NF}' | \
  sort | uniq -c | sort -rn
```

## Tips voor agent-gebruik

1. **Vermijd interactive modus** — gebruik altijd `fzf --filter`, `fzf --query`, of `grep/rg/jq` in plaats van fzf zonder arguments
2. **rg --json** is krachtig — pipe naar jq voor gestructureerde queries
3. **jq -c** geeft compacte JSON (1 regel per item) — ideaal voor pipe-verwerking
4. **xargs -I{}** voor het uitvoeren van commands per resultaat
5. **uniq -c | sort -rn** voor tel-samenvattingen
6. **find -exec** of **find | xargs** om bulk-verwerking uit te voeren
7. **awk '$NF** selecteert laatste veld, **awk '{print $1}'** eerste kolom
