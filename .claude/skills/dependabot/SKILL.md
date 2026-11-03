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
4. **Verification has local and CI gates.** PR checks now run from `.github/workflows/ci.yml`
   (added in #204), so CI is an additional gate for the jobs it covers. Run
   `make cc <service>` in the worktree and require it to pass before opening a PR
   (open-pr skill rule); do not assume every job is covered by PR CI (the droid job may
   not be).
5. **Publish with native git push; MCP for metadata** (two-plane policy, PR #96):
   workers verify and commit locally in their worktrees; the coordinator pushes each
   branch with `git push origin HEAD:deps/<branch>` (allowed-prefix branches only;
   `--force` only over branches this batch itself created) and opens the PR via
   `create_pull_request` (base `bb_develop`). Never re-create local commits with
   `push_files` — that path truncated large lockfiles (see below) and loses history.
   Merging uses `gh pr merge` with human authorization (MCP has no merge endpoint).
6. **Same-file overlap.** Migration PRs share manifests/lockfiles with their lane PR
   (yarn.lock, libs.versions.toml). Merge order: lane PR first, then migrations. When a
   sibling then shows conflicts, know that two shortcuts DON'T work: pushing "pre-merged"
   file content via `push_files` does not clear GitHub's conflict state when the PR's
   delta lines sit adjacent to base-changed lines (adjacent hunks conflict regardless of
   content), and `update_pull_request_branch` fails on real conflicts too. Working
   recovery (needs human-authorized native git): in the PR's worktree, `git fetch` +
   `git merge origin/<base>`, resolve the shared file (base content + this PR's deltas),
   re-run the FULL service gate on the merged tree — new version combinations must
   actually be rebuilt, not assumed — then push the merge commit to the PR branch and
   merge.
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
Please ownership, PR CI coverage, ecosystem version gates) can be relied on until the repo
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
- **Workflow files and the MCP token**: the MCP token lacks the `workflow` scope and
  rejects `.github/workflows/*` writes ("Resource not accessible by personal access
  token", still true 2026-08). Native `git push` — the standard publishing path —
  carries the user's credentials and pushes workflow files fine (verified 2026-08,
  merged workflow PRs). Actions bumps are therefore fully self-serviceable: audit each
  action's release notes for breaking changes AND license changes (see below), edit the
  workflows locally, push, open the PR.
- **Action majors can be license changes, not just code changes**: gradle/actions v6
  moved caching into a proprietary, non-MIT component whose commercial Terms of Use are
  accepted implicitly by upgrading (caching defaults on). Read every actions major's
  release notes for licensing/ToU language; on a hit, hold at the last permissive major,
  encode an ignore rule, and leave the upgrade as an explicit human licensing decision.
- **Runtime-image bumps are policy decisions, not version bumps**: Node 22 is in
  maintenance until 2027-04-30, Node 24 is Active LTS, and Node 26 was promoted to LTS
  on 2026-10-28; Node 25 is non-LTS and past EOL. Verify runtime status against the
  Node release schedule when doing future bumps. Interpreter minors (Python 3.12→3.14)
  are gated on the slowest native-wheel publisher in the stack. spaCy 3.8.18 declares
  `<3.16` and ships cp315 wheels. The gate is `uv.lock`, not upstream availability:
  inspect wheel tags for the versions actually locked, not just the latest release.
  Move the interpreter, CI, and lock together in one PR. `-slim` images have no
  compiler for the sdist fallback.
- **Type-stub packages track the runtime, not latest**: `@types/node` stays on the
  runtime's Node major (Dockerfile base image / CI node-version); ignore stub majors
  until the runtime itself moves.
- **Linter-plugin majors can expand coverage**: the ktlint gradle plugin ≥13 wires up
  source sets the 12.x config never actually linted, turning a "version bump" into a
  codebase-wide reformat plus manual fixes. That is a separate scoped cleanup task —
  ignore-rule the major until the cleanup lands.
- **Encode every discovered gate as a `dependabot.yml` ignore rule** (with a comment
  naming the gate and its removal condition): compileSdk waves, licensing holds,
  reformat cliffs, runtime-alignment holds. Otherwise the bot re-proposes known-blocked
  updates every scan and the queue never stays clean. For one-off rejections on an open
  bot PR, an `@dependabot ignore this major version` comment closes it and persists the
  ignore bot-side. DEFERRED (not rejected) PRs — valid targets that are merely early,
  e.g. an interpreter bump waiting on an upstream wheel — stay OPEN with the
  `blocked-upstream` label and a comment stating the blocker, the concrete unblock
  condition (what to check, where), and the verification step to run before merging.
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
- **Dependabot group PRs can contain gated halves**: #196 and #193 each mixed a safe
  bump with a held bump (OTel 0.300 and otel-instrumentation 2.31). Never merge a
  Dependabot group PR without reading its file diff against the ignore list. Compare
  groups against the lane PR before assuming they overlap.
- **Dependabot PR verification**: CI checks cover some failure classes, but not
  necessarily every job (the droid job may not be covered). A bot PR that violates an
  uncovered gate can still merge green and break `bb_develop`. Never merge a droid bot
  PR unverified. Two safe paths: (a) the audited lane PR, or
  (b) for self-contained bot PRs (e.g. an AGP + Gradle-wrapper toolchain pair, whose
  regenerated wrapper files are easier to take than to replicate), check out the bot
  PR's exact head branch, merge current base into it, run the FULL service gate on
  that merged tree, and merge only on green (done 2026-08 for AGP 9.3.1/Gradle 9.6.1).
  Gate-violating bot PRs get closed with a comment naming the gate. Verify bot PR
  contents directly; workers must not assume the PR's contents from its title or
  description. For droid, rerun checks with
  `./gradlew testDebugUnitTest lintDebug assembleDebug --rerun-tasks`; a `make cc` log
  served from cache may show `UP-TO-DATE`. For back, run `yarn prisma generate` in a
  fresh worktree before lint; otherwise lint can report about 865 false type errors.
  The nlp venv was CPython 3.14.4 while CI used 3.12; state interpreter differences in
  the PR body.
- **Action pinning**: `astral-sh/setup-uv` v8 and later do not publish floating major
  tags. Pin an exact tag, such as `@v10.3.3`.
- **Dependabot close and ignore mechanics**: for a held dependency in a group PR, close
  the group with a comment and add the corresponding `.github/dependabot.yml` ignore;
  do not use an `@dependabot ignore` command. For a single-dependency PR, use
  `@dependabot ignore this major version`, which also closes the PR.
- **Dependabot tooling gotchas**: this repository is `Roquentin97/languee`, not
  `anki-agent`. `list_pull_requests` output is too large for the context window; parse
  the saved file with a script. `update_issue` with `labels` replaces the whole label
  set, so include existing labels. If a Bash call fails with a seccomp error, apply
  the documented recovery to every Bash call.
- **Re-scan Dependabot**: there is no public Dependabot CLI or API call to trigger a
  re-scan. Use GitHub UI with repository write access: open
  `Roquentin97/languee` → Insights → Dependency graph → Dependabot, then select
  "Check for updates" for each ecosystem.
- **In-range refresh ≠ full minor/patch audit**: `yarn outdated` rows where
  `wanted == current < latest` (same major) are OUT-OF-RANGE minors — the specifier
  itself must be bumped (0.x caret ranges pin the minor, so every 0.x minor step is
  out-of-range, e.g. class-validator 0.14→0.15). A lane that only refreshes in-range
  versions leaves these behind and dependabot re-proposes them immediately.
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
- **Lockfiles vs `push_files` (historical, 2026-07)**: MCP `push_files` topped out at
  ~45–50KB per call; stalled calls still EXECUTED, committing truncated lockfiles to
  remote branches, and partial re-pushes never converge (each push replaces the whole
  file). The two-plane policy (native push, PR #96) removed this failure class — kept
  here as the signature to recognize if `push_files` is ever pointed at a generated
  file again. If that happens: verify remotely via `get_file_contents` (line count +
  tail vs local) and never open a PR against an unverified lockfile.

## Per-PR body requirements

Description, target service, affected modules, release impact (patch via `deps`), QA
summary with real command results, and — where manifests overlap — the required merge
order relative to sibling PRs. State interpreter versions used locally and in CI when
they differ. `make cc <service>` remains required locally; passing PR CI is an additional
gate, limited to its covered jobs. Do not claim a PR is safe based only on green CI or a
cached `UP-TO-DATE` local log; verify its file diff and run the relevant checks.
