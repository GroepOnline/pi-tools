# Changelog

## Unreleased

### Added

- Added runtime-preferred SDK loading with a Node/Bun fallback and the `FFF_SDK` override.
- Added `ffgrep.maxMatchesPerFile` to keep a single generated or vendored file from dominating a result page.
- Added `ffgrep.compact` for deterministic `path:line:match` output without context blocks.

### Tests

- Added regression coverage for SDK candidate ordering, runtime overrides, fallback errors, and compact grep formatting.

### Compatibility

Existing `ffgrep` calls keep their previous defaults. The new result-policy options are opt-in, and pagination remains cursor-based.
