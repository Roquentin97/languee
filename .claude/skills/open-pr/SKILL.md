---
name: open-pr
description: Use whenever the user asks to open, create, publish, or prepare a GitHub pull request for Languee, including Forge PR stages.
---

# Open PR

Use this skill for every PR-opening request. If the user asks to "use the skill" in a
PR-opening context, this is the skill.

## Hard requirements

- Use GitHub MCP for every GitHub or remote operation: inspecting remote branches,
  creating remote branches, publishing commits or files, opening pull requests, and
  adding PR comments.
- Do not use `gh`, `git pull`, `git fetch`, `git push`, or other native git remote
  operations unless the human explicitly overrides this skill for the current task.
- Local git inspection and commit preparation are allowed: `git status`, `git diff`,
  `git log`, `git add`, and `git commit`.
- Do not open the PR until all affected app versions are bumped and every required
  `make cc <affected-service>` command passes.
- If GitHub MCP is unavailable, stop and report that the PR cannot be opened safely.

## Affected services

Determine affected services from changed paths, the spec target service, and any
cross-service contract changes:

- `apps/languee-back/**` -> `languee-back`
- `apps/languee-nlp/**` -> `languee-nlp`
- `apps/languee-droid/**` -> `languee-droid`
- Shared root files, Docker, Forge, or Claude tooling can affect one or more services.
  Use the spec and changed behavior to decide. If no app service can be determined,
  treat all three services as affected unless the human explicitly narrows the scope.

## Version bump

Every PR must include an app version bump before opening. Bump the app version for every
affected service; for shared/root/tooling-only changes with no narrower service scope,
bump all three services.

- `languee-back`: bump `APP_VERSION` in
  `apps/languee-back/src/modules/health/health.service.ts`.
- `languee-nlp`: bump `VERSION` in
  `apps/languee-nlp/src/languee_nlp/constants.py`.
- `languee-droid`: bump both Android app version fields in
  `apps/languee-droid/app/build.gradle.kts`:
  - increment `defaultConfig.versionCode` by 1
  - patch-bump `defaultConfig.versionName`; if it has no patch component, use the next
    patch version, for example `1.0` -> `1.0.1`

Default to a patch bump unless the human explicitly requests a different version.
Include the version bump in the PR branch before verification and publication.

## Verification

From the monorepo root, run the full service check for each affected service:

```bash
make cc <affected-service>
```

Fix every warning or error that appears and rerun the same command until it passes. If
fixing a failure requires non-version code changes during a Forge run, return to the
appropriate Forge stage instead of bypassing the pipeline.

Run `make cc <affected-service>` after the final commit is prepared so commitlint checks
the commit that will be published. If a later fix changes the commit, rerun the command.

## Pull request

Use these defaults unless the human or spec says otherwise:

- Base branch: `develop`
- Head branch: use the Conventional Commit type as the branch prefix
  (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, or `ci/`)
- Title: Conventional Commit format
- Body: include the spec description, target service or services, affected
  modules/components, version bumps, and QA summary

After opening the PR through GitHub MCP, add a PR comment linking the source Notion spec
when one exists:

```text
Notion spec: <spec.notion_url>
```

For Forge runs, write the PR URL back to Notion `Agent output`, set the final Notion
status as instructed by the pipeline, and clean up the worktree only after the PR is
opened successfully.
