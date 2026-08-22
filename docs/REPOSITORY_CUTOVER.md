# GroepOnline Independent Repository Cutover

## Purpose

This runbook records the safe cutover of `GroepOnline/pi-tools` to a standalone repository identity while preserving the existing package name, licence obligations, and release continuity.

> **Decision required before execution:** the rename/create/push steps below change a public GitHub repository identity. They must be confirmed immediately before execution.

## Recommended cutover model

Create a new, independent `GroepOnline/pi-tools` repository with a **new root commit**. Preserve the current GitHub fork under an archival name and keep the MIT licence plus [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) in the independent repository.

This model removes the public fork badge and GitHub network lineage at the destination URL. It deliberately does **not** retain the old Git commit graph in the new repository, so historical source provenance is recorded through notices rather than inherited commit history.

| Option | GitHub fork badge | Old Git history | Attribution approach | Recommendation |
| --- | --- | --- | --- | --- |
| Keep the current repository | Remains | Preserved | Existing licence | Not sufficient. |
| Create an independent repository with copied history | Removed | Preserved | Licence and history | Acceptable when history continuity matters. |
| Create an independent repository with a new root commit | Removed | Not carried | MIT licence and third-party notice | **Recommended for a clean ownership reset.** |

## Current release constraint

GroepOnline currently exposes a nightly release with MCP assets, but no matching stable `v0.10.5` release. The checked-in installer and Homebrew formula are pinned to the existing stable assets. Do **not** switch those pinned download URLs until the first GroepOnline stable release has been built and verified; doing so first would break installations.

The release workflow and Makefile are already prepared to use the GroepOnline repository for the next release. After that release, update `install-mcp.sh` and `Formula/fff-mcp.rb` with the generated tag and checksums in the same release commit.

## Execution runbook

| Step | Action | Verification |
| --- | --- | --- |
| 1 | Freeze writes to the current repository and fetch the final upstream state. | Working tree is clean and the upstream baseline is recorded. |
| 2 | Preserve the current fork by renaming it to `pi-tools-legacy-fork-YYYYMMDD` and marking it archived/read-only. | The legacy URL remains available for audit and release recovery. |
| 3 | Create a new public **non-fork** repository named `GroepOnline/pi-tools`. | GitHub repository metadata reports `fork: false` and has no `parent`. |
| 4 | Initialise the prepared source tree as a new Git repository with a single root commit. | `git log --all --oneline` shows only the new root history; `git remote -v` has only the new `origin`. |
| 5 | Push `main`, configure default branch protection, enable issues, and add the existing issue templates. | A new issue can be created through GroepOnline templates. |
| 6 | Publish and verify the first GroepOnline stable GitHub release and its checksums. | Downloaded MCP assets pass SHA-256 checks on supported targets. |
| 7 | Update the installer and Homebrew formula to that release, then publish a new `@groeponline/pi-tools` package version. | npm package metadata and the Pi package page point to the new independent repository. |
| 8 | Archive or make private the legacy fork only after a rollback window and package verification. | Public product links resolve to the standalone repository. |

## Cutover acceptance criteria

The migration is complete only when the following conditions are all true:

1. GitHub reports `GroepOnline/pi-tools` as `fork: false` with no parent/source relationship.
2. The project README, package metadata, issue templates, crash messages, release workflow, and package page point to GroepOnline.
3. The MIT licence and third-party notice remain present.
4. The first GroepOnline release supplies all installer and formula assets referenced by version and checksum.
5. `@groeponline/pi-tools` installs successfully in a fresh Pi environment and its package page links back to the standalone repository.

## Prepared changes in this branch

This branch already removes public fork language from the main documentation, refreshes package metadata, directs issue and crash channels to GroepOnline, prepares future release automation for the GroepOnline repository, and adds the licence notice needed for an independent-repository cutover. It intentionally leaves the current pinned MCP installer and Homebrew formula on their existing verified assets until the first matching GroepOnline stable release exists.
