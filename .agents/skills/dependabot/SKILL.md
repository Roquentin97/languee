---
name: dependabot
description: Audit, resolve, or batch-process Languee dependency updates and Dependabot pull requests when requested.
---
# Dependency updates

Inventory open Dependabot PRs and `.github/dependabot.yml`, including queues limited by open PR caps. Audit each requested ecosystem with its package registry and lockfile, not only existing PRs. Group compatible minor and patch updates by service; isolate major, runtime, toolchain, license, and incompatible updates. Read release notes and verify transitive dependencies, runtime alignment, wheel support, and changed license terms. Escalate licensing or incompatible product decisions to the user.

Coordinate shared manifests and lockfiles, validate the exact final tree with `make cc` for each affected service, and follow the shared PR skill for publication. Never merge without authorization. For ecosystem-specific historical observations, consult [observations](references/observations.md); verify them against current versions before acting. Avoid unnecessary bot changes; perform external writes only within the user's request.
