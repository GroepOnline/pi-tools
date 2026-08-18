<a href="./assets/logo-orange.png"><img alt="FFF" src="./assets/logo-orange.png" width="300"></a>

<p>
  <i>A file search toolkit for humans and AI agents. Really fast.</i>
</p>

Typo-resistant path and content search, frequency-ranked file access, a background watcher, and a lightweight in-memory content index. Way faster than CLIs like ripgrep and fzf in any long-running process that searches more than once.

**[GroepOnline/pi-tools](https://github.com/GroepOnline/pi-tools)** is GroepOnline's file search toolkit. The product we ship is the pi extension [`@groeponline/pi-fff`](#pi-agent-extension). The same repository also contains the Neovim plugin, MCP server, Node/Bun SDKs, C library, Python bindings, and Rust crates, so every frontend shares one Rust core.

---

## Contents

- [Pi agent extension](#pi-agent-extension) — `@groeponline/pi-fff`
- [Packages](#packages) — what we publish
- [Carried components](#carried-components) — MCP server, fff.nvim, Node/Bun SDK, Rust crate, C library, Python bindings
- [Performance](#performance)
- [Repository layout](#repository-layout)
- [Contributing](#contributing) · [License](#license)

---

## Pi agent extension

A [pi](https://github.com/badlogic/pi-mono) extension that replaces the built-in `find` and `grep` tools with FFF and feeds the interactive editor's `@`-mention autocomplete from the frecency-ranked index.

```bash
pi install npm:@groeponline/pi-fff
```

Project-local install:

```bash
pi install -l npm:@groeponline/pi-fff
```

### What it replaces

| Built-in tool | pi-fff replacement | Improvement |
|---|---|---|
| `find` (spawns `fd`) | `fffind` (FFF `fileSearch`) | Fuzzy matching, frecency ranking, git-aware, pre-indexed |
| `grep` (spawns `rg`) | `ffgrep` (FFF `grep`) | SIMD-accelerated, frecency-ordered, mmap-cached, no subprocess |
| *(none)* | `fff-multi-grep` (FFF `multiGrep`) | OR-logic multi-pattern search via Aho-Corasick |
| `@` file autocomplete (fd-backed) | `@` file autocomplete (FFF-backed, default) | Fuzzy ranking from the FFF index and frecency |

### Modes

Three operating modes, switchable at runtime with `/fff-mode`:

| Mode | What it does |
| --- | --- |
| `tools-and-ui` (default) | Adds `ffgrep` and `fffind` tools, replaces `@`-mention autocomplete with FFF. |
| `tools-only` | Only tool injection. Keeps pi's native editor autocomplete. |
| `override` | Replaces pi's built-in `grep`, `find`, and `multi_grep` with FFF implementations. |

Env vars: `PI_FFF_MODE`, `FFF_FRECENCY_DB`, `FFF_HISTORY_DB`. Flags: `--fff-mode`, `--fff-frecency-db`, `--fff-history-db`. The databases default to your existing fff.nvim ones when present, otherwise `~/.pi/agent/fff/`.

### Agent-facing tools

- `ffgrep`. Content search. Accepts `path`, `exclude` (comma, space, or array; leading `!` optional), `caseSensitive`, `context`, and cursor pagination. Auto-detects regex, falls back to fuzzy on zero exact matches, rejects `.*`-style wildcard-only patterns up front.
- `fffind`. Path and filename search. Matches the whole repo-relative path, not just the filename. Frecency-aware. The weak-match detector flags scattered fuzzy noise before it floods the agent's context.

### Commands

- `/fff-mode [tools-and-ui | tools-only | override]`. Show or switch the mode.
- `/fff-health`. Picker, frecency, and git integration status.
- `/fff-rescan`. Force a rescan.

Source: [`packages/pi-fff/`](./packages/pi-fff/). Full documentation: [`packages/pi-fff/README.md`](./packages/pi-fff/README.md).

---

## Packages

- **We publish** under the `@groeponline` npm scope: `@groeponline/pi-fff`, `@groeponline/fff-node`, `@groeponline/fff-bun`. Releases are cut from `v*` tags; see [`docs/RELEASE.md`](./docs/RELEASE.md).
- **CI.** Build and publish runs on version tags and manual dispatch. The test matrix is Linux-only on push/PR and expands to the full 3-OS matrix on release tags.
- **Native binaries.** The Node/Bun SDKs load `@ff-labs/fff-bin-*` platform packages from npm. We consume those packages; we do not republish them.

---

## Carried components

These frontends share the Rust core in this repository. Install the published `@groeponline` packages where they exist; otherwise build from source here.

### MCP server

A file search MCP server for Claude Code, Codex, OpenCode, Cursor, Cline and any MCP-capable client. Fewer grep roundtrips, less wasted context.

- Frecency memory, warm-up from git touch history.
- Definition-first hinting classified on the Rust side.
- Smart-case with auto-fuzzy fallback: `IsOffTheRecord` finds snake_case variants; zero-match queries retry as fuzzy.
- Git-aware annotations for modified, untracked and staged files.

Installers: [`install-mcp.sh`](./install-mcp.sh) and [`install-mcp.ps1`](./install-mcp.ps1). Prebuilt binaries: [GitHub Releases](https://github.com/GroepOnline/pi-tools/releases). Source: [`crates/fff-mcp/`](./crates/fff-mcp/).

```sh
curl -fsSL https://raw.githubusercontent.com/GroepOnline/pi-tools/main/install-mcp.sh | bash
```

### fff.nvim

A Neovim file picker built on the same Rust core: fuzzy + frecency + git-aware ranking, live grep, preview, multi-select and quickfix.

```lua
{ 'GroepOnline/pi-tools', build = 'make build' }
```

Config reference: `:help fff.nvim`. Source: [`lua/`](./lua/) + [`crates/fff-nvim/`](./crates/fff-nvim/).

### Node & Bun SDK

TypeScript wrapper over the C library. Build custom agent tools, CLIs or IDE integrations.

```bash
npm install @groeponline/fff-node
# or
bun add @groeponline/fff-node
```

```ts
import { FileFinder } from "@groeponline/fff-node";

const finder = FileFinder.create({ basePath: process.cwd(), aiMode: true });
if (!finder.ok) throw new Error(finder.error);
await finder.value.waitForScan(10_000);

const files = finder.value.fileSearch("incognito profile", { pageSize: 20 });
const hits = finder.value.grep("GetOffTheRecordProfile", { mode: "plain", smartCase: true });

// 10-100x faster glob matching than Bun's and Node's implementations
const rustFiles = finder.value.glob("**/*.rs", { pageSize: 100 });

finder.value.destroy();
```

Every method returns a `Result<T>` (`{ ok: true, value } | { ok: false, error }`). Type reference: [`packages/fff-node/src/types.ts`](./packages/fff-node/src/types.ts).

### Rust crate

FFF is written in Rust, so this is the lowest-overhead way to use it. Use the workspace crate from this repository:

```toml
[dependencies]
fff-search = { git = "https://github.com/GroepOnline/pi-tools" }
```

Source: [`crates/fff-core/`](./crates/fff-core/).

### C library

Stable C ABI. Bind from C/C++, Zig, Go via cgo, Python via ctypes, or anything with C FFI.

```bash
make build-c-lib
# or: cargo build --release -p fff-c --features zlob
```

The `zlob` feature (requires the [Zig](https://ziglang.org) toolchain) switches glob matching and filesystem traversal to zlob's native parallel walker. The output is a `cdylib` (`libfff_c.so` / `.dylib` / `fff_c.dll`); the header lives at [`crates/fff-c/include/fff.h`](./crates/fff-c/include/fff.h). Source: [`crates/fff-c/`](./crates/fff-c/).

### Python bindings

Build from this repository with `uv`:

```bash
cd packages/fff-python
uv sync --all-extras
uv run maturin develop --release
```

```python
from fff import FileFinder

with FileFinder("/path/to/project", watch=False) as finder:
    finder.wait_for_scan_blocking(timeout_ms=5000)

    result = finder.search("main")
    for item, score in zip(result.items, result.scores):
        print(f"{item.relative_path}: {score.total}")

    hits = finder.grep("class Profile", mode="plain", before_context=1, after_context=1)
```

---

## Performance

### Why FFF is faster

ripgrep and fzf are great CLI tools, but every invocation forks a new process, re-reads `.gitignore`, re-stats directories and rebuilds state before it can answer. FFF keeps the index and file cache resident in one long-lived process and exposes the same Rust core through every layer. On a 500k-file Chromium checkout that is the difference between 3–9 seconds per ripgrep spawn and sub-10 ms per FFF query.

- **No process spawn.** Every call stays in-process.
- **Typo-resistant matching.** Smith-Waterman fuzzy scoring on the grep path; SIMD-accelerated fuzzy matching (from the [frizbee](https://github.com/saghen/frizbee) core) for paths, surviving dropped characters and reorderings.
- **Persistent memory.** Directory tree, git status, frecency and content index stay warm between searches.

### Memory tradeoff

FFF keeps its index in RAM: about 360 bytes per indexed file for the content index (≈36 MB for a 100k-file repo). On a 14k-file repo the resident footprint is ≈26 MB. Binaries, oversized files and non-grep-able files are skipped; the index can be memory-mapped instead of anonymous RAM.

If you run one grep from a shell, `rg` is still the right tool. If you run dozens inside one process, FFF pays for itself from the second call.

### How it compares

- **ripgrep** — same regex engine, better plain-text matching, resident content index. Wins on repeated-search workloads, loses on "grep once from bash".
- **fzf** — FFF is fuzzy like fzf, but also frecency-aware, git-aware and more typo-tolerant.
- **Telescope / fzf-lua / snacks.picker** — FFF ships its own picker on the same core.
- **Tantivy / full-text engines** — different class: Tantivy persists an inverted index for document scoring at scale; FFF is scoped to one repository and optimised for sub-10 ms response.

---

## Repository layout

- `crates/fff-core` - Rust core: index, watcher, frecency, scoring.
- `crates/fff-grep` - SIMD content search.
- `crates/fff-query-parser` - Query constraint parsing.
- `crates/fff-c` - C FFI library used by every language binding.
- `crates/fff-mcp` - MCP server binary.
- `crates/fff-nvim` - Lua/mlua bindings for the Neovim plugin.
- `crates/fff-python` - Python bindings (maturin).
- `packages/fff-node` - Node.js SDK (`@groeponline/fff-node`).
- `packages/fff-bun` - Bun SDK (`@groeponline/fff-bun`).
- `packages/pi-fff` - pi extension (`@groeponline/pi-fff`).
- `packages/fff-python` - Python package sources.
- `packages/fff-bin-*` - Platform binary package layouts (`@ff-labs/fff-bin-*` on npm; consumed, not republished here).
- `lua/` - Neovim plugin code. `doc/` - vimdoc.

---

## Contributing

Bug reports and pull requests welcome at [GroepOnline/pi-tools](https://github.com/GroepOnline/pi-tools). Agentic coding tools are welcome, but human review is mandatory. Keep code in line with the rules in [`AGENTS.md`](./AGENTS.md). Release process: [`docs/RELEASE.md`](./docs/RELEASE.md).

## License

[MIT](./LICENSE).

## FAQ

### What does FFF stand for?

There is intentionally no single canonical definition. Pick your favourite:

- **F**ast **F**ile **F**inder
- **F**uzzy **F**ile **F**inder
- will search **F**iles **F**or **F**ood

The brand hex is `#F87216`, not `#FFF`. Logo variants: [orange](./assets/logo-orange.png) · [dark](./assets/logo-dark.png) · [light](./assets/logo-light.png).
