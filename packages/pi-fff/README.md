# @groeponline/pi-fff

`@groeponline/pi-fff` is a [Pi](https://github.com/badlogic/pi-mono) extension for fast, local file discovery and content search. It adds FFF-powered search tools and can provide FFF-ranked `@` file completion in the interactive editor.

The extension is designed for repeated exploration of a workspace. It builds a local index in the background, then uses that index for fuzzy path matching and content search. File-use history and local Git state can improve result ranking when available.

## Install

Install globally:

```bash
pi install npm:@groeponline/pi-fff
```

Install for one project only:

```bash
pi install -l npm:@groeponline/pi-fff
```

Verify the package source, current version, and supported Pi metadata at [pi.dev/packages/@groeponline/pi-fff](https://pi.dev/packages/@groeponline/pi-fff).

## Choose a mode

The default mode is deliberately additive: it gives an agent access to FFF tools without changing the names of Pi’s standard tools.

| Mode | Registered search tools | `@` completion | Recommended use |
| --- | --- | --- | --- |
| `tools-and-ui` | `fffind`, `ffgrep` | FFF-backed | Default for most interactive sessions. |
| `tools-only` | `fffind`, `ffgrep` | Pi default | Use when another extension manages autocomplete. |
| `override` | `find`, `grep` | FFF-backed | Use only when replacing Pi’s standard search tools is intentional. |

Set the mode at startup:

```bash
pi --fff-mode tools-and-ui
# or
PI_FFF_MODE=override pi
```

The resolution order is **flag → environment variable → global configuration → default**. A mode changed with `/fff-mode` is retained in the session. Moving into or out of `override` requires `/reload`, because Pi must register the tool names again.

## Search tools

### `fffind`

`fffind` searches workspace-relative paths with fuzzy matching. It is suitable for locating files from an incomplete filename, a concept, or a path fragment. Results are ranked by the local engine; use a `path` constraint for a directory, exact filename, or glob and use `exclude` to remove noise.

| Parameter | Type | Description |
| --- | --- | --- |
| `pattern` | string | Fuzzy search terms, for example `config`, `src auth`, or `main.ts`. |
| `path` | string, optional | Directory prefix, filename, or glob such as `src/`, `main.rs`, or `src/**/*.ts`. |
| `exclude` | string or string array, optional | Paths or globs to omit, such as `test/`, `*.min.js`, or `vendor/`. |
| `limit` | number, optional | Results per page; default is 30. |
| `cursor` | string, optional | Opaque cursor returned by a previous result to request the next page. |

Use `fffind` for **paths**. Use `ffgrep` when you know text that should occur inside a file.

### `ffgrep`

`ffgrep` searches file content with smart-case behaviour: a lowercase pattern is case-insensitive; a pattern containing uppercase characters is case-sensitive. Patterns with valid regular-expression syntax are searched as regular expressions, while other patterns are treated as literal text. If a plain-text search has no exact result, the extension may show useful fuzzy alternatives.

| Parameter | Type | Description |
| --- | --- | --- |
| `pattern` | string | Text or regular expression to find. |
| `path` | string, optional | Directory prefix, filename, or glob that limits the search. |
| `exclude` | string or string array, optional | Paths or globs to omit from the search. |
| `caseSensitive` | boolean, optional | Forces case-sensitive matching; omit it to keep smart-case behaviour. |
| `context` | number, optional | Context lines before and after a match; range 0–20. |
| `limit` | number, optional | Maximum matches in a page; default is 20. |
| `cursor` | string, optional | Opaque cursor returned by a previous result to request the next page. |

Use a concrete substring, identifier, or expression. A wildcard-only expression such as `.*` is rejected because it is not an efficient way to read an entire file.

### Optional multi-pattern search

Set `PI_FFF_MULTIGREP=1` before starting Pi to enable the experimental `fff-multi-grep` tool. It searches for **any** of several literal patterns in one request and is useful when an agent must check known naming variants together.

| Parameter | Type | Description |
| --- | --- | --- |
| `patterns` | string array | One or more literal alternatives; matching uses OR logic. |
| `constraints` | string, optional | File filter such as `*.{ts,tsx} !test/`. |
| `context` | number, optional | Context lines before and after a match; range 0–20. |
| `limit` | number, optional | Maximum matches in a page; default is 20. |
| `cursor` | string, optional | Opaque cursor returned by a previous result to request the next page. |

The tool is opt-in while its interaction pattern is evaluated. Do not depend on it for a workflow that requires stable default tool availability.

## Commands

| Command | Purpose |
| --- | --- |
| `/fff-mode [tools-and-ui \| tools-only \| override]` | Shows the current mode or records a mode for the current session. |
| `/fff-health` | Displays the engine version, mode, Git integration, index status, persistence status, and active scan progress. |
| `/fff-rescan` | Requests a new file scan for the active workspace. |

## Persistent configuration

Create `pi-fff.json` in Pi’s agent directory. The default location is `~/.pi/agent/pi-fff.json`; `PI_CODING_AGENT_DIR` changes the base directory.

```json
{
  "$schema": "https://raw.githubusercontent.com/GroepOnline/pi-tools/main/packages/pi-fff/pi-fff.schema.json",
  "mode": "tools-and-ui",
  "enableFsRootScanning": false,
  "enableHomeDirScanning": true
}
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `$schema` | string | None | Enables editor validation and completion. |
| `mode` | string | `tools-and-ui` | One of `tools-and-ui`, `tools-only`, or `override`. |
| `frecencyDbPath` | string | Auto-resolved | Location for file-use ranking data. |
| `historyDbPath` | string | Auto-resolved | Location for query-selection history. |
| `enableFsRootScanning` | boolean | `false` | Explicitly allows scans started from `/`. |
| `enableHomeDirScanning` | boolean | `true` | Allows scanning when Pi starts in the home directory. |

Malformed configuration, unknown fields, and invalid values prevent the extension from loading and identify the configuration path in the error. `/fff-mode` changes session state only; it does not edit this file.

## Database resolution

Frecency and history paths resolve independently in the following order:

1. The matching Pi flag: `--fff-frecency-db` or `--fff-history-db`.
2. The matching environment variable: `FFF_FRECENCY_DB` or `FFF_HISTORY_DB`.
3. The matching global configuration value: `frecencyDbPath` or `historyDbPath`.
4. A compatible existing local Neovim FFF database, when available.
5. A Pi-local directory created on demand at `$PI_CODING_AGENT_DIR/fff/{frecency,history}`; by default this is `~/.pi/agent/fff/{frecency,history}`.

The extension reads local ranking data but does not record the agent’s searches in an existing Neovim history database. If a database is unavailable, search remains usable without persisted ranking data and Pi displays a warning.

## Scanning scope and resource use

Scanning the filesystem root is disabled by default. Scanning from the home directory is enabled by default, because it is a normal Pi starting location, but a large home tree can take time and CPU to index.

```bash
pi --fff-enable-home-scan=false
# or
FFF_ENABLE_HOME_SCAN=0 pi
```

Use `--fff-enable-root-scan` or `FFF_ENABLE_ROOT_SCAN=1` only when indexing from `/` is explicitly intended.

## Privacy and security

The extension runs locally in the Pi process. It does not implement network calls, telemetry, or credential handling. Search-state directories and optional database paths remain on the local machine.

As with every Pi extension, review the package source and its dependencies before use. The published source, issue tracker, and release context are available from the [GroepOnline repository](https://github.com/GroepOnline/pi-tools).

## Development

For a source checkout, work from this package directory:

```bash
npm install
npm run typecheck
bun test test/
```

Workspace formatting and lint checks run from `packages/`:

```bash
npm run check:ci
```

See the repository-level [development guidance](../../AGENTS.md) for maintainership requirements.

## References

[1]: https://pi.dev/packages/@groeponline/pi-fff "@groeponline/pi-fff on pi.dev"
[2]: https://github.com/GroepOnline/pi-tools "GroepOnline/pi-tools repository"

[1] [2]
