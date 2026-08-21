# Changelog

## Unreleased

### Added

- Added `ffgrep.maxMatchesPerFile` to keep a single generated or vendored file from dominating a result page.
- Added `ffgrep.compact` for deterministic `path:line:match` output without context blocks.

### Tests

- Added regression coverage for compact grep formatting and `maxMatchesPerFile` clamping.

### Compatibility

Existing `ffgrep` calls keep their previous defaults. The new result-policy options are opt-in, and pagination remains cursor-based.
