# Extension Research Notes

## Sources reviewed

- Pi extension documentation: <https://pi.dev/docs/latest/extensions>
- Pi settings documentation: <https://pi.dev/docs/latest/settings>
- Pi package catalog: <https://pi.dev/packages>
- GroepOnline public repositories: <https://github.com/orgs/GroepOnline/repositories?type=archived>

## Findings

Pi extensions can register custom tools and commands, persist session state, subscribe to lifecycle and tool events, register flags, contribute custom rendering, and provide custom autocomplete. Background work should start after `session_start` and be cleaned up at `session_shutdown`.

Pi distinguishes global and project configuration. Project-local resources require project trust, which makes a global-only package configuration a sensible default for settings that change registered tool names.

The package catalog demonstrates that agent packages increasingly combine narrow tools with deliberate workflow and UI behaviour. This supports improving pi-tools through focused search quality, visibility, and configuration rather than adding unrelated agent orchestration.

The public GroepOnline organization includes related Pi repositories: `pi-wishcraft`, `pi-agent-orchestrator`, `pi-subagents-tui`, `pi-cli-search-tools`, `pi-control`, and `pi-missions`. `pi-subagents-tui` is publicly marked as archived; its potential utility should be evaluated by source inspection before reuse.

## Initial opportunities

1. Add a single, stable `fff-search` tool that can select path, literal-content, regular-expression, or multi-pattern behaviour from explicit intent while retaining `fffind` and `ffgrep` for compatibility.
2. Add a structured search-explainability mode or details payload with ranking signals, scan readiness, matched files, and timing so agents can decide whether to refine rather than repeat searches.
3. Make search results more token-aware by adding file-level deduplication, a per-file match cap, and a compact/expanded response selector.
4. Add configurable ignore profiles for generated, vendored, binary, dependency, and secret-prone paths, with project trust respected before reading project-local policy.
5. Improve index lifecycle observability: status widget, initial-scan progress, last-indexed timestamp, resource estimates, and explicit cancellation/retry semantics.
6. Reuse suitable patterns from GroepOnline’s agent-oriented repositories only after licence, API, maintenance, and dependency checks.

## GroepOnline repository review

`pi-subagents-tui` is archived and presents a JSON-over-stdin Go sidecar for a cinematic multi-agent dashboard. Its useful transferable pattern is not the sidecar itself but its disciplined status contract: a small typed payload, explicit running/completed/failed states, malformed-input handling, terminal-resize tests, and visual showcase assets. For pi-tools, the equivalent should be a native Pi status/widget implementation rather than a new binary process; the extension API already exposes status and custom UI mechanisms.

`pi-cli-search-tools` is a small Pi skill for non-interactive `rg`, `fzf`, `jq`, `awk`, and pipeline use. It confirms a complementary role for pi-tools: the extension should remain the fast, stateful first choice for repeated workspace search, while skill guidance can teach when a one-shot shell query or structured JSON filter is the more appropriate tool. The repository's Pi-session log search script is potentially useful as a separate opt-in diagnostic utility, not as a runtime dependency of pi-tools.

## Refined opportunities

7. Add a native `/fff-status` or improve `/fff-health` with a compact widget/status line modeled on the archived dashboard’s explicit lifecycle states, but avoid a sidecar process and extra language runtime.
8. Add a package-provided Pi skill or documentation decision guide that tells agents when to choose `fffind`/`ffgrep` versus one-shot `rg`, `jq`, or session-log tooling. This keeps the extension focused while improving tool selection.
9. Add an opt-in diagnostic command to export **non-sensitive** index statistics and tool latency to a local JSON file, making performance regressions reproducible without telemetry.

## Upstream issue review

The current FFF issue backlog includes Pi-extension items for direct-editable hashline headers, runtime detection under Bun-compiled hosts, multi-pattern match attribution, search inclusion controls, explicit ignored-path search, and auxiliary-index routing. These are more valuable near-term than new broad tooling because they improve correctness, host interoperability, and result quality.

Issue [#795](https://github.com/dmtrKovalenko/fff/issues/795) proposes adding deterministic `[path#TAG]` headers to `ffgrep` and `fffind` results for Oh My Pi compatibility. The tag can be derived from file bytes without session access, but Pi extensions cannot access the host's stricter seen-line provenance store. Therefore this is viable only as an opt-in compatibility formatter with a clearly documented limitation; it must not claim that strict host edit guards are satisfied.

## Prioritized implementation candidates

| Priority | Candidate | Rationale | Boundary |
| --- | --- | --- | --- |
| P0 | Runtime and host compatibility matrix | Prevent load failures across Pi and Bun-derived hosts; add regression tests for Node, Bun, and unsupported autocomplete APIs. | No API expansion. |
| P0 | Accurate ignored-path and auxiliary-index semantics | Directly targets active Pi-extension issues and prevents search scope surprises. | Preserve existing path contract. |
| P1 | Opt-in hashline-compatible result formatter | Reduces read-before-edit roundtrips on compatible hosts. | Do not promise strict seen-line provenance. |
| P1 | `multiGrep` match-pattern attribution | Makes OR-search results actionable and removes ambiguity. | Requires native SDK support or a safe extension-level representation. |
| P1 | Token-aware result policy | Lowers repeated search cost through per-file caps and compact/expanded output. | Preserve defaults for compatibility. |
| P2 | Native status widget and local diagnostics export | Improves observability without telemetry or a sidecar runtime. | Opt-in, local-only output. |


## Repository identity constraint

The public GitHub repository metadata reports `fork: true` and identifies `dmtrKovalenko/fff` as both `parent` and `source`. The repository is therefore still a GitHub-network fork even though its package scope, documentation, and organization are GroepOnline.

GitHub’s fork relationship cannot be cleared by a commit, remote change, README edit, or ordinary repository setting. To remove the public fork lineage while retaining the `GroepOnline/pi-tools` address, the practical cutover is: preserve the current fork under a temporary archival name, create a **new independent** `GroepOnline/pi-tools` repository, push a locally prepared independent history and release configuration, then migrate issues, releases, links, and package metadata as needed. This cutover changes a public repository identity and requires explicit confirmation before the rename/create/push operation.

Until that confirmation, the working copy can be made technically independent by removing the `upstream` remote from the final clone and by avoiding public fork language. The existing source history remains visible in any copied Git history; a brand-new root commit is the only way to omit that history completely, which trades off traceability and contributor attribution. The recommended default is an independent repository with a preserved, attributed commit history and a `THIRD_PARTY_NOTICES.md` file.

## Additional GroepOnline and upstream findings

`pi-wishcraft` shows a mature native Pi extension architecture: typed domain modules, a status-oriented UI, cached expensive data, bounded custom commands, input sanitization before terminal rendering, release documentation, a changelog, and an explicit roadmap. For pi-tools, the relevant pattern is a compact native status segment with cached scan information and sanitized local metadata—not queueing, autonomous background work, or broad editor ownership.

Issue [#714](https://github.com/dmtrKovalenko/fff/issues/714) confirms that ignored paths inside the active workspace remain a deliberate design decision rather than a straightforward defect. A scoped auxiliary index for an explicitly named ignored file or directory is useful, but indiscriminate indexing of large ignored trees such as `node_modules` can be expensive. Any implementation should require an exact, concrete path; impose a scan budget; reuse a bounded auxiliary pool only when the root matches exactly; show scan progress; and preserve the default ignore-aware workspace search.

## Recommendation update

Promote scoped ignored-path search only after introducing explicit safety limits: maximum scan duration, maximum files or bytes, cancellation through the extension signal, a visible warning for dependency trees, and tests for normal paths, ignored files, ignored directories, exact-root reuse, and budget exhaustion. This keeps the feature useful for one named configuration or generated artifact without turning `fffind` into an unrestricted dependency crawler.

## SDK runtime compatibility candidate

Issue [#778](https://github.com/dmtrKovalenko/fff/issues/778) and open PR [#779](https://github.com/dmtrKovalenko/fff/pull/779) identify a concrete host-compatibility gap: a Bun-compiled host can expose `globalThis.Bun` while rejecting TypeScript entry points from `node_modules`. The proposed low-risk solution retains runtime preference but attempts the alternate SDK when the preferred dynamic import fails. It also offers an `FFF_SDK=bun|node` override and includes isolated unit tests for candidate ordering, successful fallback, and final error propagation.

This change is suitable for adoption only after reviewing the actual PR diff, applying it as a focused compatibility commit, and running the new SDK tests plus the existing extension suite. It should be versioned as a patch release and documented as host compatibility, not a behavioural search change.
