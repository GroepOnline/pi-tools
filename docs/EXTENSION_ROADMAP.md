# GroepOnline FFF Extension Roadmap

**Scope.** This roadmap covers the Pi extension [`@groeponline/pi-fff`](https://pi.dev/packages/@groeponline/pi-fff), not a general rewrite of the Rust search engine. The target is a local-first search experience that is predictable for agents, observable for users, and resilient across supported Pi hosts.

> **Product principle:** keep the default search path fast, indexed, and ignore-aware. Expand behaviour only through explicit, bounded opt-ins that do not silently turn workspace search into broad filesystem crawling.

## Research basis

Pi extensions can register tools, commands, flags, lifecycle handlers, session state, custom rendering, and autocomplete providers. Background resources are expected to start after `session_start` and be released at `session_shutdown`. [1] Pi also distinguishes global and trusted project-local configuration, so controls that alter registered tool names should remain global by default. [2]

The current extension already implements the core product: FFF-backed path search, content search, local ranking state, and a mode-dependent autocomplete integration. The recommended work therefore concentrates on host compatibility, explicit search-scope control, compact result quality, and native status visibility rather than unrelated agent orchestration.

| Evidence source | What it contributes | Design consequence |
| --- | --- | --- |
| Pi extension API | Lifecycle, UI, custom tools, commands, autocomplete, state. [1] | Use Pi-native status and lifecycle hooks; do not add a separate daemon for ordinary search state. |
| Pi settings model | Global and trusted project-local resource boundaries. [2] | Keep tool-name and security-sensitive defaults global; load project policy only after trust. |
| FFF issue backlog | Host compatibility, ignored-path scope, result interoperability, multi-pattern attribution. [3] | Prioritise reliability and search-contract clarity before broad features. |
| GroepOnline `pi-wishcraft` | Native TUI structure, cached work, bounded commands, sanitised terminal text, release documentation. [4] | Add a compact native status surface and maintain a changelog/release discipline. |
| Archived `pi-subagents-tui` | Typed status payloads and explicit lifecycle states. [5] | Reuse the state-model idea only; avoid a new sidecar runtime. |
| GroepOnline `pi-cli-search-tools` | A complementary one-shot CLI-search skill. [6] | Publish clear tool-choice guidance instead of duplicating every shell search capability. |

## Priority roadmap

| Priority | Initiative | User outcome | Delivery boundary | Suggested acceptance checks |
| --- | --- | --- | --- | --- |
| **P0** | Resilient SDK loading | The extension loads on Node, Bun, and Bun-compiled hosts whose resolver cannot import TypeScript from `node_modules`. | Attempt the runtime-preferred SDK first, then the compatible alternative; support an explicit `FFF_SDK` override. Do not change search semantics. | Unit-test ordering, preferred success, fallback success, final error, override isolation, and `/reload` cache behaviour. |
| **P0** | Search-scope contract | Users and agents know exactly when a query uses the workspace index, a scoped auxiliary index, or no persistent state. | Document and test absolute paths, home paths, workspace escapes, and persisted-database fallback. | Contract tests for path routing, root safety, home scanning, and database resolution. |
| **P1** | Safe explicit ignored-path search | An agent can inspect a named generated file, package manifest, or local artifact without indexing the entire ignored tree. | Require a concrete existing path; create an exact-root auxiliary finder with file/time budgets, cancellation, warning, and bounded cache. Keep ordinary workspace queries ignore-aware. | Tests for ignored file, ignored directory, tracked path, exact-root reuse, cancellation, budget exhaustion, and unchanged no-path behaviour. |
| **P1** | Token-aware result policy | Search returns enough evidence to act while avoiding repeated broad searches and context waste. | Add optional per-file caps, compact/expanded formatting, total files/matches metadata, and deterministic truncation notices. Preserve current defaults until release evidence supports a change. | Snapshot tests for grouping, pagination, context, caps, and stable ordering. |
| **P1** | Multi-pattern attribution | `fff-multi-grep` identifies which supplied pattern matched each result. | Prefer native SDK metadata when available; otherwise mark the feature unavailable instead of guessing. | Pattern attribution tests, duplicate-pattern handling, and literal-only contract tests. |
| **P2** | Native index status and diagnostics | Users can see scan state, indexed-file count, local persistence state, and safe latency statistics without telemetry. | Extend `/fff-health` and optionally add a compact status segment or widget using Pi’s native UI API. Local JSON export must be opt-in and omit paths, query text, and file content by default. | UI tests where supported; lifecycle, sanitisation, no-telemetry, and redaction tests. |
| **P2** | Optional host-compatible edit headers | Compatible hosts can move from a search result to an edit with fewer read round-trips. | Gate deterministic hashline-style headers behind an explicit formatter option. State clearly that strict seen-line provenance cannot be provided by the Pi extension API. | Formatter snapshots; compatibility test fixtures; documentation for the strict-host limitation. |
| **P3** | Tool-choice guidance | Agents use FFF for repeated local search and one-shot shell tools only when appropriate. | Ship a short package skill or documentation guide; do not make `rg`, `fzf`, or log tooling runtime dependencies. | Prompt-guideline tests and user-facing examples. |

## Recommended next release sequence

The first release should be intentionally narrow: apply and independently review the open SDK-fallback approach described in upstream PR #779, add its regression tests, and improve host diagnostics. The proposed change tries the alternative SDK only after the preferred import fails, retains the global reload cache, and is supported by a small targeted test suite. [7]

The second release should define the ignored-path safety contract before implementing it. The related proposal is valuable for agent workflows, but the current maintainers note the resource risk of broad scans such as dependency trees. [8] A concrete-path requirement, exact-root auxiliary finder, time/file budgets, cancellation, and a visible warning are non-negotiable for this phase.

The third release should focus on quality of results rather than quantity of tools. Compact output, per-file caps, stronger continuation guidance, and match attribution give agents enough information to read the correct file without expanding the permission or performance surface.

## Explicit non-goals

| Non-goal | Reason |
| --- | --- |
| A background agent, autonomous mission runner, or multi-agent scheduler inside `pi-fff` | Search should remain a focused local integration. Those concerns belong to dedicated GroepOnline agent packages. |
| A permanent Go or Rust sidecar for status rendering | Pi exposes native UI and status APIs; a separate process would add distribution, lifecycle, and failure complexity without improving search. |
| Globally disabling ignore rules | It breaks the fast default and risks indexing dependency, build, and generated trees. Only explicitly named paths should qualify for scoped handling. |
| Silent network telemetry or remote index storage | The package’s local-first privacy contract is a product differentiator and must remain intact. |
| Changing default tool names without an explicit mode | Existing Pi sessions and tool instructions rely on additive behaviour by default. |

## Delivery standards

Every release should include a changelog entry, a short migration note when the search contract changes, package and root documentation updates, and focused regression coverage. Terminal-facing values derived from local files or Git metadata must be sanitised before rendering, following the safe rendering pattern established in GroepOnline’s active Pi extension work. [4]

Package metadata should continue to point users to the GroepOnline package and repository pages. The current public package page is the canonical installation surface for `@groeponline/pi-fff`. [9]

## References

[1]: https://pi.dev/docs/latest/extensions "Pi Coding Agent — Extensions documentation"
[2]: https://pi.dev/docs/latest/settings "Pi Coding Agent — Settings documentation"
[3]: https://github.com/dmtrKovalenko/fff/issues "FFF open issues"
[4]: https://github.com/GroepOnline/pi-wishcraft "GroepOnline pi-wishcraft"
[5]: https://github.com/GroepOnline/pi-subagents-tui "Archived GroepOnline pi-subagents-tui"
[6]: https://github.com/GroepOnline/pi-cli-search-tools "GroepOnline pi-cli-search-tools"
[7]: https://github.com/dmtrKovalenko/fff/pull/779 "FFF PR #779: SDK fallback for Bun-compiled hosts"
[8]: https://github.com/dmtrKovalenko/fff/issues/714 "FFF issue #714: Explicit ignored-path search"
[9]: https://pi.dev/packages/@groeponline/pi-fff "@groeponline/pi-fff package page"
