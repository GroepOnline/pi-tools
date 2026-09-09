# Changelog

## Unreleased

### Added

- Added the `tgrep` tool: trigram-indexed content search through an external [tgrep](https://github.com/microsoft/tgrep) binary. Literal by default, `file:line:col:text` output, exit 1 reported as no-match. Registered only when the binary resolves (`TGREP_BIN`, `tgrepBinPath`, or `PATH`) and `enableTgrep` is not `false`; mode-independent.
- Added the `/tgrep-status` command showing tgrep index and server status for the workspace.
- Added `ffgrep.maxMatchesPerFile` to keep a single generated or vendored file from dominating a result page.
- Added `ffgrep.compact` for deterministic `path:line:match` output without context blocks.

### Tests

- Added regression coverage for compact grep formatting and `maxMatchesPerFile` clamping.

### Compatibility

Existing `ffgrep` calls keep their previous defaults. The new result-policy options are opt-in, and pagination remains cursor-based.
