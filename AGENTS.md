# GroepOnline/pi-tools maintainer guide

**GroepOnline/pi-tools** is the source repository for the local-search components that power the Pi extension [`@groeponline/pi-fff`](./packages/pi-fff/). The repository contains the complete workspace: Rust search primitives, native bindings, TypeScript packages, the Pi extension, MCP server, Neovim integration, tests, and release tooling.

The primary public product is `@groeponline/pi-fff`. Treat its tool registration, configuration contract, and local-data behaviour as compatibility-sensitive.

## Development commands

Prefer Makefile targets for workspace-wide tasks.

| Task | Command |
| --- | --- |
| Build workspace artifacts | `make build` |
| Run Rust linting and analysis | `make lint` |
| Format the workspace | `make format` |
| Run Rust unit and integration tests | `make test` |
| Run Node SDK tests | `make test-node` |
| Run Pi extension tests | `bun test packages/pi-fff/test/` |
| Validate TypeScript package formatting and linting | `cd packages && npm run check:ci` |

Run the smallest relevant test set first, then run the broader check when a change crosses package or native-binding boundaries.

## Coding standards

Keep implementation comments concise and useful. Comments should explain a non-obvious decision, invariant, or external constraint; they should not narrate straightforward code. Avoid module-level comment blocks and private API documentation unless the implementation cannot be safely understood without it.

Keep public interfaces stable unless a versioned migration is part of the change. Prefer private helpers and types when they are not used outside their module. Place small utility functions after the primary behaviour they support.

For TypeScript changes in `packages/pi-fff/`, validate user input, preserve the tool-registration flow, and reuse existing utilities such as `loadSdk`, `buildQuery`, and `AuxFinderPool`. Do not break the `@`-completion provider or the startup fallback that registers tools before an agent turn.

For Rust changes, prefer methods where state belongs to a type. Split a source file when it grows into several independent implementations. Do not introduce long-held mutexes or read-write locks without design review.

## Architecture

Performance-sensitive search lives in Rust; host integrations remain in their wrappers.

| Area | Responsibility |
| --- | --- |
| `crates/fff-core` | File index, watcher, frecency, query history, and ranking. |
| `crates/fff-grep` | SIMD-accelerated content search. |
| `crates/fff-query-parser` | Search-path and constraint parsing. |
| `crates/fff-c` | Native C ABI consumed by language bindings. |
| `crates/fff-mcp` | MCP server. |
| `crates/fff-nvim` and `lua/` | Neovim integration. |
| `packages/fff-node` and `packages/fff-bun` | TypeScript SDKs. |
| `packages/pi-fff` | Pi extension and configuration schema. |

Frecency and query-history databases hold local search-state information. `pi-fff` defaults to directories under `~/.pi/agent/fff/` and can reuse compatible local editor databases when configured paths are absent.

## Package and release boundaries

All GroepOnline-published TypeScript packages use the `@groeponline` scope. Ensure package imports, manifests, generated metadata, lockfiles, and documentation use the same scope. A scope mismatch between an import and manifest is a runtime defect.

The platform-specific `@ff-labs/fff-bin-*` packages remain external binary dependencies until GroepOnline provides a replacement publishing pipeline. Do not rename or publish those packages as part of routine package work.

When changing package names, dependencies, or dependency ranges, update both `packages/bun.lock` and `packages/package-lock.json`. When adding or changing a Pi configuration option, update all of the following in the same change:

1. The configuration loader and schema.
2. `packages/pi-fff/README.md`.
3. The root `README.md` when the option affects product-level behaviour.
4. Relevant tests.

## Quality bar

Every behaviour change needs an appropriate automated test. Keep changes focused, maintain clear user-facing errors, and verify package checks before release. Public documentation must describe the behaviour users receive today, not a planned or experimental behaviour unless it is explicitly marked as such.
