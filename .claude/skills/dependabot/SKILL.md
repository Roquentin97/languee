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
   `bb_develop`). Never `git push` / `gh` from agents — with ONE exception: large
   lockfiles physically cannot transit MCP and are pushed by the human (see the lockfile
   constraint below).
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

## Repo constraints (hard-won — do not rediscover)

- **Sandbox seccomp is broken on this machine**: every Bash call needs
  `dangerouslyDisableSandbox: true`, in every subagent prompt. Additionally, in agent
  worktrees the command guard rejects compound commands (`cd x && …`, nested `$()`) with
  a misleading "worktree isolation" error — use flat single commands with absolute paths
  and `--project-dir`-style flags.
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
- **GitHub MCP token cannot write `.github/workflows/*`** (no `workflow` scope). Never
  plan a consolidated actions-bump PR; instead triage dependabot's own actions PRs
  (mergeable? breaking changes?) and hand the merge decision to the human.
- **nlp**: `uv` is not installed globally. Download a standalone binary to `$TMPDIR` and
  use the Makefile's `UV=` override. Version-dependent footgun: `make cc languee-nlp`
  runs `uv run --extra dev`, whose implicit sync USED to strip the manually installed
  `en_core_web_md` model wheel (CI works around it with `--no-sync`); with uv ≥0.11.32
  the sync is inexact (add-only) and the model survives — still check for a
  missing-model pytest failure and fall back to reinstall + `--no-sync` if it appears.
  Never raise the spacy floor past what the pinned model wheel version supports.
- **droid**: kotlin/ksp/compose-plugin versions move as one set; the `otel` catalog
  version is its own coupled group. Worktrees need `local.properties` with
  `sdk.dir=/home/antoine/Android/Sdk` — create it, NEVER push it. `ktlintFormat` passes
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
  (google/dagger#5190/#5177): the fix is `kotlin-metadata-jvm` (version.ref kotlin) added
  to FOUR configurations — `ksp`, `compileOnly`, `testImplementation`,
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
- **MCP `get_pull_request` returns no `mergeable`/`mergeable_state` field.** Infer
  mergeability (have the PR's target files changed on the base since branching? is
  `merge_commit_sha` non-null?) and confirm in the GitHub UI before merging.
- **Lockfiles CANNOT go through MCP `push_files`.** A worker's single tool call tops out
  around 45–50KB of content (proven twice, two different truncation points on a 306KB
  `uv.lock`) — a stalled call still EXECUTES, leaving a truncated file on the remote
  branch, and partial pushes never converge (each push replaces the whole file).
  Protocol: workers verify + commit locally on their worktree branch and report
  `ready-for-manual-push` with worktree path, branch, and commit hash; the human pushes
  each branch (`git -C <worktree> push --force origin HEAD:<deps-branch>` — their own
  push, no rule conflict); the coordinator then verifies the remote lockfile via
  `get_file_contents` (line count + tail vs local) and opens the PR via MCP (metadata
  only, no size risk). Small files (manifests, sources) may still go via `push_files`.

## Per-PR body requirements

Description, target service, affected modules, release impact (patch via `deps`), QA
summary with real command results, and — where manifests overlap — the required merge
order relative to sibling PRs.
