# Releasing GroepOnline/pi-tools

Canonical repository: [GroepOnline/pi-tools](https://github.com/GroepOnline/pi-tools).

A GroepOnline release is a `v*` git tag. GitHub Actions (`Build & Publish`) builds the native artifacts and publishes the `@groeponline` npm packages. There is no separate publish step outside this repo.

## What a release publishes

On a `v*` tag push, npm packages and GitHub Release assets always publish. PyPI
and crates.io publish only when the matching org variable gate is set to
`'true'` (`vars.GROEPONLINE_PUBLISH_PYPI` / `vars.GROEPONLINE_PUBLISH_CRATES`).
A manual `workflow_dispatch` run republishes npm only; it never publishes
PyPI or crates.io.

| Artifact | Where |
|---|---|
| `@groeponline/pi-tools` | npm |
| `@groeponline/fff-node` | npm |
| `@groeponline/fff-bun` | npm |
| Neovim native modules, C FFI libs, MCP binaries, Python wheels and sdists | [GitHub Releases](https://github.com/GroepOnline/pi-tools/releases) |

`workflow_dispatch` can republish the npm packages (and optionally PyPI/crates when enabled) but does **not** create or upload GitHub Release assets; those require a `v*` tag push.

The Node/Bun SDKs load `@ff-labs/fff-bin-*` platform packages from npm. **Do not republish those.** We consume them; we do not own that scope.

CI on a GroepOnline tag also pins checksums in `install-mcp.sh`, bumps `Formula/fff-mcp.rb`, and commits those files to `main`.

## Cut a release

1. Land the work on `main`.
2. Tag an annotated version and push it:

```bash
git tag -a vX.Y.Z -m "Release X.Y.Z"
GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline' git push origin main
GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline' git push origin vX.Y.Z
```

3. Confirm the `Build & Publish` workflow on [GroepOnline/pi-tools](https://github.com/GroepOnline/pi-tools/actions) published the three `@groeponline/*` packages.

Optional helper: `./scripts/release.sh X.Y.Z` bumps Cargo and Python versions, commits, tags, and pushes. Run it on a machine with a Rust toolchain (for example `chef-runner-01`), not on laptop `joep`.

## Not part of a GroepOnline release

- Do not publish crates.io crates or a PyPI `fff-search` package from a laptop one-off.
- Do not retag or republish `@ff-labs/fff-bin-*`.
- Do not push tags to any repository other than `GroepOnline/pi-tools`.
