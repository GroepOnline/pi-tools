---
name: release
description: Cut a GroepOnline/pi-tools release (v* tag, npm publish @groeponline/*). Use when tagging, publishing, or answering how this repo ships.
---

# Release GroepOnline/pi-tools

Canonical flow: [`docs/RELEASE.md`](../../../docs/RELEASE.md).

1. Land on `main`.
2. Tag `vX.Y.Z` and push to `GroepOnline/pi-tools` (`GIT_SSH_COMMAND='ssh -F ~/.ssh/config-groeponline'`).
3. `Build & Publish` on a `v*` tag push publishes `@groeponline/pi-tools`, `@groeponline/fff-node`, `@groeponline/fff-bun`, plus GitHub Release assets, and publishes PyPI/crates.io when their org-variable gates are set. Manual `workflow_dispatch` republishes npm only.

Do not republish `@ff-labs/fff-bin-*`. Do not publish crates.io or PyPI from a laptop. Do not tag any other git remote.
