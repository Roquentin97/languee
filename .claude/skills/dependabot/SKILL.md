---
name: dependabot
description: Use whenever the user asks to solve, resolve, clean up, or batch-process dependabot PRs or the dependency-update backlog for Languee.
---

# Dependabot batch resolution

Resolve the full dependency backlog — open dependabot PRs AND the hidden queue behind
`open-pull-requests-limit` — via consolidated per-ecosystem PRs, not one merge per bot PR.

## Core strategy

1. **Inventory.** List open PRs via GitHub MCP, group by ecosystem lane:
   npm → `apps/languee-back`, pip → `apps/languee-nlp`, gradle → `apps/languee-droid`,
   github-actions and docker → root. Check `.github/dependabot.yml`: any lane sitting AT
   its `open-pull-requests-limit` almost certainly has a hidden queue behind it.
2. **The dependabot PR list is NOT the work list.** Each lane worker runs the
   ecosystem's own audit and bumps everything in tier:
   - back: `yarn outdated`
   - nlp: compare `pyproject.toml` floors against PyPI (`https://pypi.org/pypi/<pkg>/json`)
   - droid: compare `gradle/libs.versions.toml` entries against Google Maven / Maven Central
3. **Risk tiers.**
   - Minor+patch: one consolidated `deps(<service>): bump minor and patch dependencies`
     PR per lane, branch `deps/<service>-minor-patch`.
   - Each major or toolchain jump (e.g. Kotlin, an OpenTelemetry stack) gets its OWN
     migration PR so it is independently revertable and cannot block the easy merges.
4. **Verification is local-only.** This repo's CI workflows are push-triggered on
   `bb_develop` only — **PRs get NO CI**. `make cc <service>` in the worktree is the only
   quality gate; it must genuinely pass before any PR is opened (open-pr skill rule).
5. **Publish via GitHub MCP** (open-pr skill): local commit first (commit-msg hook +
   commitlint validate the message), then `create_branch` from `bb_develop` →
   `push_files` with exact final file contents → `create_pull_request` (base
   `bb_develop`). Never `git push` / `gh` from agents; if a large generated file fails
   MCP transit, use the lockfile recovery pass below (verification + human-run push).
6. **Same-file overlap.** Migration PRs share manifests/lockfiles with their lane PR
   (yarn.lock, libs.versions.toml). Merge order: lane PR first, then migrations; refresh
   stale siblings with `mcp update_pull_request_branch` (or regenerate the lockfile) after
   each merge.
7. **Keep the queue drained going forward.** `dependabot.yml` must carry `groups`
   (minor+patch per ecosystem; ALL update-types for github-actions, since action tags are
   majors). After the batch merges, trigger a re-scan (GitHub UI: Insights → Dependency
   graph → Dependabot → "Check for updates") and confirm only deliberate majors reappear.

## Subagent plan

Never run the fleet at the session model. Per lane/migration: one **sonnet** worker in an
isolated worktree (`Agent` tool, `isolation: "worktree"`). One **sonnet** read-only triage
agent for github-actions + docker (no worktree). The main model only orchestrates,
adjudicates failures, and synthesizes. Typical batch: ~7 agents, launched in parallel in
one message; droid workers contend on Gradle caches — that's slow, not broken.

Worker prompts MUST forbid `run_in_background`: workers that background a long build then
"stand by" end their turn and stall until manually resumed. Require foreground commands
with `timeout: 600000`, and require the worker to keep going until its final report (or a
precise blocked-reason) is produced.

## Constraints and recovery passes (hard-won — do not rediscover from scratch)

These are dated field observations, not permanent truths. Repo-invariant rules (Release
Please ownership, no-PR-CI, ecosystem version gates) can be relied on until the repo
changes; anything environmental (tool availability, token scopes, API ceilings, sandbox
behavior, filesystem paths) varies by machine and by harness version — attempt the
normal path first, recognize the failure signature, then apply the documented recovery.
Machine-specific current state lives in session memory, not here.

- **Sandbox failures (machine-specific)**: if Bash fails at seccomp init
  (`apply-seccomp … Permission denied`), retry with `dangerouslyDisableSandbox: true` and
  pre-authorize workers in their prompts to do the same on that signature. Agent-worktree
  command guards may also reject compound commands (`cd x && …`, nested `$()`) with a
  misleading "worktree isolation" error — fall back to flat single commands with absolute
  paths and `--project-dir`-style flags.
- **Version research: don't trust WebFetch summaries for version numbers** — the
  summarizer has fabricated plausible latest-version claims. Prefer direct `curl` to
  registry metadata (`maven-metadata.xml`, PyPI JSON) or raw CHANGELOGs, and cross-check.
- **A "single-artifact" major can cascade through transitives**: e.g. the OTel Android
  exporter transitively forces okhttp 5.x onto the whole classpath regardless of the
  catalog pin (breaking mockwebserver 4.x at test runtime). After a risky bump, check
  `./gradlew :app:dependencies` for conflict-resolution rewrites in the affected group
  and bump forced companions explicitly, majors included.
- **OTel JS 0.57→0.221 (SDK 2.x) migration facts** (back, done 2026-07): `Resource` class
  removed → `resourceFromAttributes({...})`; `spanProcessor:` → `spanProcessors: [...]`;
  `sdk-trace-base` KEEPS the `(exporter, config?)` BatchSpanProcessor signature — the
  CHANGELOG's breaking note applies only to the NEW `sdk-trace` package (read package
  source, not changelog summaries, before "fixing" call sites);
  `auto-instrumentations-node` carries an undeclared peer dep on `core@^2` (harmless on
  Yarn Classic, hard-fails under strict peer-dep managers).
- **Workflow files may be unpushable via MCP**: a token lacking the `workflow` scope
  rejects `.github/workflows/*` writes with "Resource not accessible by personal access
  token" (state as of 2026-07). Recovery: on that signature, don't fight it — triage
  dependabot's own actions PRs instead (breaking changes? mergeable?) and hand the merge
  decision to the human. Re-test on later runs; the scope may have been granted.
- **nlp**: if `uv` is missing on the machine (it has been), download a standalone binary
  to `$TMPDIR` and use the Makefile's `UV=` override. Version-dependent footgun: `make cc languee-nlp`
  runs `uv run --extra dev`, whose implicit sync USED to strip the manually installed
  `en_core_web_md` model wheel (CI works around it with `--no-sync`); with uv ≥0.11.32
  the sync is inexact (add-only) and the model survives — still check for a
  missing-model pytest failure and fall back to reinstall + `--no-sync` if it appears.
  Never raise the spacy floor past what the pinned model wheel version supports.
- **droid**: kotlin/ksp/compose-plugin versions move as one set; the `otel` catalog
  version is its own coupled group. Worktrees need `local.properties` with `sdk.dir`
  pointing at the machine's Android SDK (copy from the main checkout's
  `local.properties` or derive from `ANDROID_HOME`) — create it, NEVER push it. `ktlintFormat` passes
  vacuously (not wired to .kt sources). Don't raise compileSdk for a deps batch.
  Additional gates found 2026-07: AGP is floored by the **Gradle wrapper** version
  (independent of Kotlin) — wrapper bumps are toolchain changes, not lane bumps; a whole
  androidx release wave (core-ktx ≥1.19, lifecycle ≥2.11, hilt-navigation-compose ≥1.4)
  requires **compileSdk 37** — treat "raise compileSdk" as one dedicated migration PR
  that unlocks them all. Fast repro for AAR-metadata failures:
  `./gradlew :app:checkDebugAarMetadata` (~8s vs a full lint pass).
  **KSP versioning decoupled from Kotlin at KSP 2.3.0** — the old `<kotlinVersion>-x.y.z`
  pairing convention no longer holds; pick the KSP version the Kotlin docs pair with the
  target Kotlin release. **Hilt ≤2.60.1 cannot read Kotlin ≥2.4 metadata**
  (google/dagger#5190/#5177, open as of 2026-07 — check whether a newer Dagger release
  fixed it before applying any workaround): the fix is `kotlin-metadata-jvm` (version.ref
  kotlin) added to FOUR configurations — `ksp`, `compileOnly`, `testImplementation`,
  `androidTestImplementation` (the documented single-line `ksp(...)` workaround misses the
  Hilt Gradle plugin's javac aggregating task for test variants). Project-side override —
  remove once Dagger ships a real fix.
- **Dependabot PRs can be known-bad**: with no PR CI, a bot PR that violates one of
  these gates (e.g. a compileSdk-37 artifact) merges green and breaks `bb_develop`.
  Never merge bot PRs directly for droid; the audited lane PR is the safe path, and
  gate-violating bot PRs should be closed with a comment naming the gate.
- **Release Please owns versions**: never touch `version.txt`, `CHANGELOG.md`,
  `health.service.ts`, `constants.py`, or Android `versionName` in deps PRs. `deps` type
  → patch release; don't hide dep bumps behind `chore`.
- **Tooling-only files** (e.g. `dependabot.yml` itself) are not consumed by any build:
  state the `make cc` deviation explicitly in the PR body instead of running ceremony
  checks.
- **Docker ecosystem is non-recursive**: one `dependabot.yml` entry per directory that
  contains a Dockerfile (root compose + each `apps/<service>` with a Dockerfile). And
  "0 open docker PRs" does NOT mean images are current — a silent scanning gap was
  observed (stale in-scope compose images, zero PRs, no ignore rules); verify via a
  registry-tag audit and GitHub's Dependabot logs, never by PR count alone.
- **MCP `get_pull_request` may omit `mergeable`/`mergeable_state`** (it did in 2026-07).
  If absent, infer mergeability (have the PR's target files changed on the base since
  branching? is `merge_commit_sha` non-null?) and confirm in the GitHub UI before merging.
- **Large generated files (lockfiles) may not survive MCP `push_files`.** Observed
  2026-07: a worker's single tool call topped out ~45–50KB of content; a stalled call
  still EXECUTES, committing a truncated file to the remote branch, and partial re-pushes
  never converge (each push replaces the whole file). Recovery pass, in order:
  (1) push the lockfile ALONE in one complete-content call; (2) verify remotely via
  `get_file_contents` — line count + tail must match local; (3) at most ONE retry if
  truncated; (4) still truncated → stop pushing, worker reports `ready-for-manual-push`
  (worktree path, branch, commit hash), the human runs
  `git -C <worktree> push --force origin HEAD:<deps-branch>` (their own push — no rule
  conflict), and the coordinator re-verifies remotely and opens the PR via MCP (metadata
  only, no size risk). Never open a PR against an unverified lockfile. Small files
  (manifests, sources) go via `push_files` normally.

## Per-PR body requirements

Description, target service, affected modules, release impact (patch via `deps`), QA
summary with real command results, and — where manifests overlap — the required merge
order relative to sibling PRs.
