# @groeponline/pi-tools — Compatibility Contract

> Status: **1.0-readiness contract** (defined 2026-08-31, issue #13).
> This document is the canonical, human-readable surface of the `@groeponline/pi-tools`
> Pi extension. The machine-readable authority is `packages/pi-tools/pi-tools.schema.json`
> and the tool definitions in `packages/pi-tools/src/index.ts`. Where this doc and the
> schema disagree, the schema wins and this doc is wrong — file a bug.

## Tool surface

The extension registers two custom tools and one completion surface (names resolved from
mode; see below):

| Tool | Purpose |
|---|---|
| `fffind` | Typo-resistant file discovery + frecency-ranked access |
| `ffgrep` | SIMD content search |

Source of truth: `packages/pi-tools/src/index.ts:52-53` (`grep: "ffgrep", find: "fffind"`),
registered via `queueTool(() => toolNames.grep, …)` / `queueTool(() => toolNames.find, …)`.

### Parameters

Parameter shapes, defaults and allowed values are defined in `pi-tools.schema.json`
(`properties`). Compatibility surface = the parameter **names**, **types**, **enums**, and
**defaults** for both tools, plus their pagination behavior:

- **Pagination:** `fffind` results are returned in pages; the caller passes a page
  offset/limit. The exact parameter names and defaults are in the schema
  (`packages/pi-tools/pi-tools.schema.json`). Changing page semantics (offset→cursor,
  page-size defaults, result ordering across pages) is a breaking change.
- **Mode dependence:** `tools-only` mode registers only `fffind`/`ffgrep` (no picker UI);
  `tools-and-ui` adds the file picker; `override` uses the Pi-side override config. A tool
  disappearing when mode changes is expected; a mode value being removed is breaking.

### Config precedence

Config values are resolved in this priority order
(`packages/pi-tools/src/index.ts:272` `getConfigValue`, read at startup
`resolveStartupConfig`):

```
flag (--fff-mode / --fff-frecency-db / --fff-history-db / …)
  > env (PI_FFF_MODE / FFF_FRECENCY_DB / FFF_HISTORY_DB / FFF_ENABLE_ROOT_SCAN / FFF_ENABLE_HOME_SCAN)
  > schema config (config.mode / config.frecencyDbPath / …)
  > package default
```

Concrete defaults:

| Key | Flag | Env | Config | Default |
|---|---|---|---|---|
| mode | `--fff-mode` | `PI_FFF_MODE` | `config.mode` | `tools-and-ui` |
| frecency DB | `--fff-frecency-db` | `FFF_FRECENCY_DB` | `config.frecencyDbPath` | (platform db path) |
| history DB | `--fff-history-db` | `FFF_HISTORY_DB` | `config.historyDbPath` | (platform db path) |
| root scan | `--fff-enable-root-scan` | `FFF_ENABLE_ROOT_SCAN` | `config.enableFsRootScanning` | `false` |
| home scan | `--fff-enable-home-scan` | `FFF_ENABLE_HOME_SCAN` | `config.enableHomeDirScanning` | `true` |

Mode valid values (`packages/pi-tools/src/config.ts:8` `VALID_MODES`):
`tools-and-ui`, `tools-only`, `override`.

**Compatibility promise:** renaming a parameter, removing a mode value, reordering this
precedence, or changing pagination shape is a **breaking** change → major version
(see Versioning policy).

## Runtime support matrix

The published package's supported runtimes and the CI jobs that prove them:

| Runtime | Version floor | CI evidence |
|---|---|---|
| Pi extension host (Bun) | Bun ≥ 1.2 (bundled runtime) | `external-tests.yml` e2e, `lua.yml`, `rust.yml` |
| Node (SDK consumers) | Node ≥ 20 (`fff-node`) | `external-tests.yml` + `rust.yml` (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`) |
| Bun (SDK consumers) | `fff-bun` engines | `external-tests.yml` + `lua.yml` |
| Python | `fff-python` (pyproject requires-python) | `python.yml` |
| Neovim (Lua picker) | fff.nvim compat | `lua.yml` + `panvimdoc.yaml` |

Exact floors are read from the owning manifests (`packages/fff-bun/package.json`,
`packages/fff-node/package.json`, `packages/fff-python/pyproject.toml`). A runtime listed
here without a corresponding CI job is a release blocker — add the job or drop the claim.

## Local-only / no-telemetry boundary

`@groeponline/pi-tools` is **local-only**:

- All search, frecency/history indexing and ranking happen on the machine; DBs live in the
  platform data directory (`resolveDbPaths`).
- The extension makes **no outbound network calls** for its core function. The only
  `https://` references in package metadata are doc/asset URLs (README, logo, Pi.dev
  gallery), never runtime endpoints.
- No telemetry, no analytics, no crash reporting, no remote config.
- The env/flag surface documented above is the *only* configuration.

Enforced by `scripts/check-no-telemetry.sh` (greps extension source for network API calls).

## Versioning policy

- `@groeponline/pi-tools` follows **semantic versioning**.
- **Breaking** = any change to the compatibility surface above: tool parameter rename or
  removal, mode enum change, config precedence reorder, pagination shape change,
  schema/`pi-tools.schema.json` alteration, runtime-floor drop.
- **Breaking changes require a major version** (1.x → 2.0, …). Before 1.0, breaking
  changes are still major-rule-governed once 1.0 ships; while at 0.x, a breaking change
  bumps the minor (0.10 → 0.11) per 0.x semver convention — but the *requirement to tag it
  breaking* is the same.
- Additive-only changes (new optional param, new mode value that does not remove behavior,
  docs) are minor/patch.
- Release path: publish via the `v*` tag → `release.yaml`; the published npm version must
  equal `packages/pi-tools/package.json` version (`scripts/check-version-sync.sh`).

## Benchmark reproducibility

Public performance claims (e.g. README "way faster than ripgrep/fzf") must be backed by a
reproducible measurement:

- `scripts/benchmark-compare.sh` builds the release binary, runs the pinned workloads, runs
  ripgrep/fzf equivalents, and writes a JSON artifact recording tool version, commit SHA,
  CPU/host, and measurements.
- The README must link the script and the latest artifact instead of asserting raw numbers.

## Enforcement overlap

| Check | Script / test | CI wiring |
|---|---|---|
| Tool surface + schema | `packages/pi-tools/test/compat-surface.test.ts` | `external-tests.yml` (via `make test-bun`) |
| Package manifest + tarball | `packages/pi-tools/scripts/verify-pi-package-contract.mjs` | `external-tests.yml` |
| Version sync | `scripts/check-version-sync.sh` | `external-tests.yml` |
| No telemetry | `scripts/check-no-telemetry.sh` | `external-tests.yml` |
| Breaking-major guard | `scripts/check-breaking-version.sh` | pre-release (`release.yaml`) |
| Benchmarks | `scripts/benchmark-compare.sh` | manual / scheduled |