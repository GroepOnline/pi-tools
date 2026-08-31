---
title: Define and gate @groeponline/pi-tools 1.0 readiness
date: 2026-08-31
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
origin: https://github.com/GroepOnline/pi-tools/issues/13
scope: pi-tools
status: planned
---

# Define and gate @groeponline/pi-tools 1.0 readiness

## Problem Frame

`@groeponline/pi-tools` is published at 0.x but shows every sign of being treated as stable: the Pi extension ships `fffind`/`ffgrep` custom tools, a file picker UI, and a config surface (`fff-mode`, `fff-*-db`, scan toggles), all consumed by agents. Bumping to 1.0 "for catalog optics" without a defined compatibility contract would lock in undocumented behavior. Issue #13 lists seven gates that must hold before a 1.0 tag. This plan defines each gate as an implementation unit with evidence, tests, and a CI enforcement point — so "1.0" means "the contract is documented, tested, and reconciled", not "we felt like releasing".

Scope boundary: this is a readiness/governance pass on `packages/pi-tools` + CI. It does not change search behavior, add features to the Rust core, or touch the Neovim plugin/Lua/Python surfaces beyond version reconciliation as evidence.

## Requirements Traceability (issue #13 gates)

| Gate (#13) | Requirement | Evidence today | Unit |
|---|---|---|---|
| G1 | `fffind`/`ffgrep` params, modes, pagination, config precedence = documented compatibility surface | `src/index.ts:52-53` maps tools; `pi-tools.schema.json` has `mode` enum + config keys; runtime read at `index.ts:320` via `getConfigValue("fff-mode", "PI_FFF_MODE", config.mode, ...)` | U1 |
| G2 | Supported Pi/Node/Bun runtime matrix explicit + CI-covered | CI: `external-tests.yml` (e2e, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`), `rust.yml`, `lua.yml`, `python.yml`, `nix.yml`; packages `fff-bun`, `fff-node`, `fff-python` | U2 |
| G3 | Published version reconciled with repo + npm metadata | **DRIFT: `packages/pi-tools/package.json` = `0.10.5`, npm latest = `0.10.8`** | U3 |
| G4 | Package tarball + Pi manifest contract enforced | `package.json` `pi.extensions = ["./src/index.ts"]`; `pi-tools.schema.json` at package root | U4 |
| G5 | FFF adapter dependency rationale + local/no-telemetry boundary documented | README performance claims exist; no telemetry/adapter-rationale doc found | U5 |
| G6 | Breaking tool-schema / mode changes require a major version | No versioning policy file; no CI guard | U6 |
| G7 | Benchmarks in public performance claims reproducible | `crates/{fff-core,fff-query-parser,fff-nvim}/benches`, `scripts/benchmark-claude.sh`; README claims "way faster than ripgrep/fzf" unlinked to a measured artifact | U7 |

## Key Decisions

- **K1 — One canonical contract doc.** `docs/compatibility.md` is the single source for G1/G5/G6: tool surface, config precedence, runtime matrix, telemetry boundary, versioning rule. Schema remains the machine-readable tool contract; the doc explains intent and precedence. `Governs G1, G5, G6`.
- **K2 — Version reconciliation is a code fix first, then a check.** Fix the repo↔npm drift (U3) by releasing the current `main` head as `0.10.8`-consistent (or bumping repo to match npm if identical content), then add a CI gate so drift cannot recur. Do not invent a new version; align repo `package.json` with the published npm version unless the head contains unreleased changes — in that case release head as the next patch and note it. `Governs G3`.
- **K3 — Gates are CI-enforced, not doc-promised.** Every gate that can be mechanically checked gets a workflow step or script: version reconciliation (U3), manifest/tarball contract (U4), schema validation (U1), runtime matrix jobs (U2 already exists — extend matrix doc only), breaking-change guard (U6 as a CONTRIBUTING + release-notes checklist in CI), benchmark reproducibility (U7 scripted). `Governs all`.
- **K4 — No behavior change in this pass.** Search semantics, flag semantics, and picker behavior are frozen; only docs, version alignment, and checks are added. `Governs U1-U7`.

## Assumptions

- `docs/` is the artifact root (no `.compound-engineering/` overlay in this repo; `docs_root` unset → default `docs`).
- npm `0.10.8` is a real published release of pi-tools and its content is the compatibility baseline to document; any unreleased main delta is next-patch material.
- CI already covers the runtime matrix (G2); the unit only makes it explicit in `docs/compatibility.md` and adds missing Node/Bun matrix entries if `external-tests.yml` lacks them (verify during U2).
- CHE-234 (related) is a tracking link only; no blocking dependency.

## Implementation Units

### U1 — Tool-surface compatibility contract (`docs/compatibility.md`)

- **File scope (new):** `docs/compatibility.md`
- **File scope (read):** `packages/pi-tools/src/index.ts`, `packages/pi-tools/src/config.ts`, `packages/pi-tools/pi-tools.schema.json`
- **Content (from G1):**
  - `fffind` / `ffgrep` parameter surface: names, types, defaults (from `index.ts` tool definitions + schema `properties`).
  - `fff-mode` enum `tools-and-ui | tools-only | override` and precedence: flag `--fff-mode` > env `PI_FFF_MODE` > `config.mode` > default `tools-and-ui` (verified at `index.ts:320`; document the exact chain).
  - DB-path overrides (`fff-frecency-db` / `fff-history-db`, env `FFF_FRECENCY_DB` / `FFF_HISTORY_DB`), root/home scan toggles and their env names (`FFF_ENABLE_ROOT_SCAN`, `FFF_ENABLE_HOME_SCAN`; flags `fff-enable-root-scan` / `fff-enable-home-scan`).
  - Pagination: how `fffind` pages results (verify in `src/sdk.ts` / tool impl during implementation; document the mode — offset/limit contract — and any default page size).
  - Compatibility promise wording: which of the above is breaking (any param rename, enum removal, precedence reorder, pagination shape change → major bump per U6).
- **Test:** `packages/pi-tools/test/compat-surface.test.ts` — asserts the doc's documented surface matches the live registered tools: each documented tool name exists among registered tool names, each documented flag exists via `pi.getFlag`, and the `VALID_MODES` enum matches the doc's enum.
- **Scenario TS-1:** registered tool names ⊇ `{fffind, ffgrep}` (via extension bootstrap in test harness).
- **Scenario TS-2:** every flag documented in `compatibility.md` exists on the extension (`fff-mode`, `fff-frecency-db`, `fff-history-db`, `fff-enable-root-scan`, `fff-enable-home-scan`).
- **Scenario TS-3:** `VALID_MODES` from `config.ts:8` equals the doc's mode list; default resolution `getConfigValue(...,"tools-and-ui")` returns `tools-and-ui` with no flag/env/config set.

### U2 — Runtime matrix explicit + CI-covered

- **File scope (edit):** `docs/compatibility.md` (new section "Runtime support matrix"), read `package.json` (root), `packages/fff-bun/package.json`, `packages/fff-node/package.json`, `packages/fff-python/pyproject.toml`, `.github/workflows/external-tests.yml`.
- **Content:** table of supported runtimes (Pi extension host, Bun ≥ version, Node ≥ version, packages `fff-bun` / `fff-node` engines; Python ≥ version from pyproject) and which CI job covers each (`external-tests.yml` e2e, `lua.yml`, `python.yml`, `nix.yml`). If any claimed runtime lacks a CI job, add the job to the matching workflow OR drop the claim — evidence decides.
- **Test:** extend `external-tests.yml` only if a matrix gap is found; otherwise no new test (doc-only + existing CI proves coverage).
- **Scenario TS-4:** doc matrix row for each runtime maps to a named CI job that actually runs (manual spot-check of workflow files during implementation; do not invent jobs).

### U3 — Version reconciliation + drift gate

- **File scope (edit):** `packages/pi-tools/package.json` (version), new `scripts/check-version-sync.*` + CI step.
- **Action:** determine whether npm `0.10.8` == current repo head content for the published subset. If yes: set repo `version: 0.10.8` and commit. If no (head has unreleased changes): bump to next patch (`0.10.9` is NOT assumed — decide from actual npm dist-tags and head delta during implementation) and release head.
- **CI gate:** new step in an existing workflow (prefer `external-tests.yml` or `release.yaml` pre-publish) that runs `npm view @groeponline/pi-tools version` and compares to `packages/pi-tools/package.json`, failing on mismatch — with an override env for intentional release transitions.
- **Test:** `scripts/check-version-sync.sh` exits non-zero on crafted mismatch fixture, zero on match.
- **Scenario TS-5:** repo version `0.10.5` vs npm `0.10.8` → gate fails (proves the current drift is caught).
- **Scenario TS-6:** after reconciliation, repo == npm → gate passes.
- **Scenario TS-7:** local version-sync script with a temp fake registry/`npm view` stub returns the expected exit codes (pure shell, no network in unit test).

### U4 — Tarball + Pi manifest contract enforcement

- **File scope (edit):** `scripts/` (new check script), read `package.json` (root + `packages/pi-tools`), `.github/workflows/release.yaml`.
- **Action:** script asserts (1) `packages/pi-tools/package.json` has `pi.extensions` array containing the entry that exists on disk; (2) `pi-tools.schema.json` ships in the package files; (3) tarball dry-run (`npm pack --dry-run` in package dir) includes `src/`, `pi-tools.schema.json`, and `package.json`. Wire into CI (publish workflow pre-step or external-tests).
- **Test:** `scripts/check-package-contract.sh` — positive on current tree, negative on a crafted tree with a missing schema file.
- **Scenario TS-8:** removing `pi-tools.schema.json` from files → check fails.
- **Scenario TS-9:** `pi.extensions` pointing at a non-existent file → check fails.

### U5 — Adapter rationale + local/no-telemetry boundary doc

- **File scope (edit):** `docs/compatibility.md` (new section), read `README.md`, `packages/pi-tools/src/sdk.ts` (verify no outbound calls / configurable endpoints).
- **Content:** why pi-tools shells out to the `fff` binary/adapter (bundled native binary, see `packages/fff-bin-*`); explicit statement that FFF is local-only: searches, frecency/history DBs and index stay on the machine; no telemetry endpoint; env/flag surface is the only configuration. Verify by grep for `fetch(`/`http` in the pi-tools extension source and state the result.
- **Test:** grep-based audit — `scripts/check-no-telemetry.sh` greps `packages/pi-tools/src` for network-API calls (`fetch(`, `http://`, `https://`, `net.`) and fails if found outside an allowlist comment.
- **Scenario TS-10:** source with a `fetch(` call → check fails; current source (expected clean) → passes.

### U6 — Breaking-change → major version rule

- **File scope (edit):** `docs/compatibility.md` (versioning policy section), `CONTRIBUTING.md` (if present; else create), new CI check.
- **Content:** policy — changing any G1-documented surface (tool param, mode enum, config precedence, pagination shape, schema change) requires a major version; patch/minor only for additive, non-breaking changes. Release checklist in CI: a pre-release workflow step greps the PR title/changelog for `major` / `breaking` markers and fails if a breaking change is claimed without a matching version-bump target (keep it a soft guard: warning-level unless a `semver:major` label exists — do not over-engineer).
- **Test:** `scripts/check-breaking-version.sh` with fixture inputs (breaking+no-major → fail; non-breaking → pass).
- **Scenario TS-11:** changelog entry "breaking: param rename" + repo version `0.x` → gate fails.
- **Scenario TS-12:** additive-only changelog → gate passes.

### U7 — Reproducible benchmarks

- **File scope (edit):** `scripts/benchmark-claude.sh` (read), new `scripts/benchmark-compare.sh`, edit README performance claims, `.github/workflows/*` (optional cron benchmark).
- **Action:** a script that (1) builds the release binary, (2) runs `crates/fff-core/benches`/`fff-nvim/benches` fixtures on equivalent workloads, (3) runs ripgrep/fzf equivalents, (4) emits a JSON result file with env (CPU, binary version, commit SHA, date). README claims replaced with a pointer to `scripts/benchmark-compare.sh` + the latest JSON artifact. Optional: scheduled GH Actions run posting results.
- **Test:** script runs on CI in a new lightweight job (or manually documented run) and produces the JSON — assert file exists and contains `commit`, `tool_version`, `measurements`.
- **Scenario TS-13:** `benchmark-compare.sh --output /tmp/b.json` produces valid JSON with the required keys.
- **Scenario TS-14:** README performance section contains no unsupported numeric claim not backed by the script/artifact (manual review step, listed as check).

## Dependencies & Sequencing

1. **U1 → U5 → U6** (docs/compatibility.md accumulates; U5 and U6 add sections to the same file) — can run in one doc pass by one implementer.
2. **U3** (version + check) first — it changes a tracked version and mirrors reality; other units reference the reconciled version.
3. **U4** (package contract) after U3 (schema/files may be listed by U3's release).
4. **U2** (matrix) — doc section depends on U1's doc structure; CI additions independent.
5. **U7** (benchmarks) independent — can run in parallel with U3-U6.
6. Order for the implementer: **U3 → U1 → U2 → U4 → U5 → U6 → U7** (docs built on reconciled version, checks wired last where they touch CI).

## Risks

- npm `0.10.8` content differs materially from head → releasing head as next patch is a product decision; flag it if the delta is large (K2 allows align-or-release; document which was chosen in the PR body).
- `external-tests.yml` may already cover the full matrix → U2 becomes doc-only; do not invent CI jobs (evidence decides).
- FFF picker init guard ("cannot run in root/home dirs") is intentionally separate from 1.0 gates — surfaced via `/fff` run today but out of scope here. If it blocks agent usage in practice, it should be its own issue/plan.
- Benchmark comparisons with ripgrep/fzf can be gamed by workload choice; the script must pin workloads and record env (K3: scripted + env-recorded, not a live marketing number).

## Success Criteria

- `docs/compatibility.md` exists and documents G1/G2/G5/G6 with live-code-verified content.
- `packages/pi-tools/package.json` version reconciled with npm; drift gate runs in CI and fails on mismatch.
- Package-contract and no-telemetry checks run in CI.
- Breaking-change guard runs pre-release.
- Benchmark script produces a reproducible JSON artifact and README claims point at it.
- All new checks have the listed scenarios passing; entire suite green on `main` tip.