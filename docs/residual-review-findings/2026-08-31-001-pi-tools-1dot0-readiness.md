# Residual review findings — pi-tools 1.0 readiness (plan 2026-08-31-001)

Source review: `/tmp/ce-code-review-TmVL/correctness.json` (run `ce-review-pi-tools-20260831`,
head `cb9e4a9`). All 8 findings fixed in the follow-up commit; residuals below are
**accepted risks**, tracked here per LFG convention so they stay out of the PR body.
Tracker: GitHub issue #13 (pi-tools 1.0 gates).

| # | Residual | Decision | Owner |
|---|---|---|---|
| R1 | `check-version-sync.sh` in `external-tests.yml` depends on the live npm registry; an npm outage turns the gate red (exit 2) on every PR | Accepted — fail-closed by design (drift silence is worse than a false red). Release window handled by the `PI_TOOLS_ALLOW_DRIFT=1` override env (plan U3's promised override). | CI/release |
| R2 | `release.yaml` breaking-major guard only sees `github.event.head_commit.message`; a breaking marker in an earlier commit of a squash is invisible | Accepted — document releases: the breaking marker belongs in the squash commit message; the guard compares real npm version (no baseline → warn, never false-fail). | release |
| R3 | `check-version-sync`'s `eval "$NPM_VIEW"` executes a hardcoded/trusted override string | Pre-existing, out of scope; safe today because the override is a repo-supplied constant, never user input. Do not feed untrusted values. | — |
| R4 | Post-`v*` release, tracked `packages/pi-tools/package.json` stays behind npm latest until a manual reconcile commit; main turns red on the next push | Accepted — release process must bump+commit the package version in the release PR (repo is already at `0.10.8` == npm). `PI_TOOLS_ALLOW_DRIFT=1` covers the window. | release |