<a href="./assets/logo-orange.png"><img alt="GroepOnline FFF" src="./assets/logo-orange.png" width="300"></a>

# GroepOnline FFF

**GroepOnline FFF** is the local search foundation behind [`@groeponline/pi-tools`](https://pi.dev/packages/@groeponline/pi-tools). It gives Pi agents fast, context-aware file discovery and content search without sending project files to a separate search service.

The repository contains the complete implementation used by the extension: the Rust search engine, native bindings, TypeScript packages, the Pi integration, tests, and release tooling. The primary supported product is **`@groeponline/pi-tools`**.

## Start with Pi

Install the extension globally for your Pi environment:

```bash
pi install npm:@groeponline/pi-tools
```

Use a project-local installation when the search behaviour should be scoped to one workspace:

```bash
pi install -l npm:@groeponline/pi-tools
```

> The package page, version history, and installation command are published at [pi.dev/packages/@groeponline/pi-tools](https://pi.dev/packages/@groeponline/pi-tools).

## What the extension provides

| Capability | Pi surface | Practical outcome |
| --- | --- | --- |
| Fuzzy path discovery | `fffind` | Finds relevant files from partial, reordered, or slightly misspelled path terms. |
| Content search | `ffgrep` | Searches indexed file content with smart-case matching, path filters, context lines, and pagination. |
| File mentions | `@` completion | Ranks mention suggestions using the local index and file-use history. |
| Explicit replacement mode | `override` | Registers the FFF implementation under Pi’s standard `find`, `grep`, and `multi_grep` tool names. |
| Session controls | `/fff-mode`, `/fff-health`, `/fff-rescan` | Lets users inspect, configure, and refresh the local search experience. |

The extension indexes the current workspace in the background and keeps the index available for repeated searches. Result ranking can account for local Git state and frecency information when that data is available.

## Select an operating mode

`tools-and-ui` is the default because it adds FFF capabilities without changing the standard tool names. Choose `override` only when an agent or workflow should use FFF through Pi’s built-in `find` and `grep` names.

| Mode | Tools | `@` file completion | When to use it |
| --- | --- | --- | --- |
| `tools-and-ui` | Adds `fffind` and `ffgrep` | FFF-backed | Recommended default for interactive Pi use. |
| `tools-only` | Adds `fffind` and `ffgrep` | Pi default | Use when another extension owns autocomplete. |
| `override` | Registers FFF as `find`, `grep`, and `multi_grep` | FFF-backed | Use only when replacing the standard tools is intentional. |

Set the startup mode with a flag, environment variable, or global configuration file:

```bash
pi --fff-mode override
# or
PI_FFF_MODE=tools-only pi
```

The precedence order is **flag → environment variable → configuration file → default**. A mode selected with `/fff-mode` is retained for the current session history; use `/reload` after moving into or out of `override` so Pi can register the correct tool names.

## Configure persistent defaults

Create `~/.pi/agent/pi-tools.json` to define defaults for all local Pi sessions. The directory respects `PI_CODING_AGENT_DIR` when it is set.

```json
{
  "$schema": "https://raw.githubusercontent.com/GroepOnline/pi-tools/main/packages/pi-tools/pi-tools.schema.json",
  "mode": "tools-and-ui",
  "enableFsRootScanning": false,
  "enableHomeDirScanning": true
}
```

| Setting | Type | Default | Purpose |
| --- | --- | --- | --- |
| `mode` | `tools-and-ui` \| `tools-only` \| `override` | `tools-and-ui` | Controls registered tools and mention completion. |
| `frecencyDbPath` | string | Auto-resolved | Sets the location of file-use ranking data. |
| `historyDbPath` | string | Auto-resolved | Sets the location of query-selection history. |
| `enableFsRootScanning` | boolean | `false` | Allows indexing when Pi starts from `/`. |
| `enableHomeDirScanning` | boolean | `true` | Allows indexing when Pi starts from the user home directory. |

`--fff-frecency-db`, `--fff-history-db`, `--fff-enable-root-scan`, and `--fff-enable-home-scan` provide command-line overrides. Their environment-variable counterparts are `FFF_FRECENCY_DB`, `FFF_HISTORY_DB`, `FFF_ENABLE_ROOT_SCAN`, and `FFF_ENABLE_HOME_SCAN`.

## Local data and privacy

GroepOnline FFF operates inside the local Pi process. The extension does not introduce network calls, telemetry, or credential handling. It indexes files reachable from the selected workspace and stores optional search-state data locally.

By default, the extension reuses compatible existing local search databases when present. Otherwise, it creates frecency and query-history directories under `~/.pi/agent/fff/`. If persistent storage cannot be opened, search continues without that ranking state and Pi shows a warning.

When Pi starts from a home directory, indexing can cover a large tree and consume noticeable CPU while the initial scan is running. Disable that behaviour with `--fff-enable-home-scan=false` or `FFF_ENABLE_HOME_SCAN=0` when appropriate.

## Workspace layout

| Path | Responsibility |
| --- | --- |
| `packages/pi-tools/` | Published Pi extension and its configuration schema. |
| `packages/fff-node/` and `packages/fff-bun/` | TypeScript bindings used by the extension and custom integrations. |
| `crates/fff-core/` | Indexing, ranking, watcher, and local persistence primitives. |
| `crates/fff-grep/` | Native content-search implementation. |
| `crates/fff-c/` | C ABI used by language bindings. |
| `crates/fff-mcp/` | MCP server implementation. |
| `crates/fff-nvim/`, `lua/`, and `doc/` | Neovim integration. |
| `tests/` and `packages/pi-tools/test/` | Engine and extension tests. |

## Develop and validate

The repository uses Rust for performance-sensitive functionality and TypeScript for host integration. Prefer the Makefile targets for workspace-wide work:

```bash
make build
make lint
make test
```

For the Pi extension specifically:

```bash
cd packages
npm run check:ci
bun test pi-tools/test/
```

See [`AGENTS.md`](./AGENTS.md) for maintainer conventions, compatibility requirements, and release boundaries.

## Support and contributions

Report reproducible defects and propose improvements through the [GroepOnline issue tracker](https://github.com/GroepOnline/pi-tools/issues). Contributions should include focused tests where behaviour changes and must preserve Pi tool-registration compatibility.

## License

This repository is distributed under the [MIT License](./LICENSE). Third-party notices and licensing obligations for carried components remain in their applicable source files and distribution metadata.

## References

[1]: https://pi.dev/packages/@groeponline/pi-tools "@groeponline/pi-tools on pi.dev"
[2]: https://github.com/GroepOnline/pi-tools "GroepOnline/pi-tools repository"

[1] [2]
