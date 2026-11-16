---
name: dependabot
description: Audit, resolve, or batch-process Languee dependency updates and Dependabot pull requests when requested.
---
# Dependency updates

## Resolve Dependabot PRs

When explicitly asked to resolve all outstanding Dependabot PRs, process every
configured ecosystem and outstanding update until each has a terminal outcome or a
specific external decision/blocker prevents progress. Continue after successful batches;
do not require delegation or insert mandatory stages that do not help resolve a PR.
Preserve the dependency audit, compatibility, licensing, and validation requirements
below and in the referenced observations.

An explicit request to merge authorizes merging safe Dependabot PRs. An audit or list
request does not. Before each merge, verify the PR's exact current head SHA and that all
required checks for that SHA have succeeded; failing, pending, missing, or stale required
checks block merging. Also verify compatibility and inspect the complete PR diff, including
grouped updates, against known gates and applicable license terms. Green CI alone is not
enough.

For failing CI, check out the PR's existing Dependabot branch in an isolated worktree,
reproduce and investigate the failure, and apply the necessary compatibility fix. Use
existing deterministic delivery tooling and run checks only for affected services. Push
the fix to the existing PR branch when repository authorization permits, preserving its
history and never force-pushing. Recheck required CI on the resulting exact head; merge
only after all required checks and compatibility verification pass. Never bypass tests or
weaken CI to obtain a green result.

For an update confirmed unsuitable, identify the specific incompatibility, licensing issue,
or other blocker, record the findings and attempted remediation in the PR, then use the
narrowest applicable documented Dependabot ignore command (patch, minor, or major) to
prevent equivalent PRs recurring. Follow Dependabot's command syntax for single and
grouped PRs; grouped PRs may need a PR comment and a scoped `dependabot.yml` ignore
instead of an individual bot command. Verify Dependabot acknowledged the command and the
PR closed. Do not use blanket ignores unless specifically justified. Never automatically
ignore security updates, unresolved security risks, or issues requiring a human licensing
or product decision; escalate them. Report intentionally ignored and closed PRs separately
from PRs left open awaiting a decision.

Finish with a concise console summary for every processed PR: number, dependency,
outcome (merged, repaired and merged, closed/ignored, or blocked), and validation results.
For every closed or blocked PR, include its specific reason and required follow-up.

Inventory open Dependabot PRs and `.github/dependabot.yml`, including queues limited by open PR caps. Audit each requested ecosystem with its package registry and lockfile, not only existing PRs. Group compatible minor and patch updates by service; isolate major, runtime, toolchain, license, and incompatible updates. Read release notes and verify transitive dependencies, runtime alignment, wheel support, and changed license terms. Escalate licensing or incompatible product decisions to the user.

Coordinate shared manifests and lockfiles, validate the exact final tree with `make cc` for each affected service, and follow the shared PR skill for publication. Never merge without authorization. For ecosystem-specific historical observations, consult [observations](references/observations.md); verify them against current versions before acting. Avoid unnecessary bot changes; perform external writes only within the user's request.
