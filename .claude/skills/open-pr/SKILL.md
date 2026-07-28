---
name: open-pr
description: Use whenever the user asks to open, create, publish, or prepare a GitHub pull request for Languee, including Forge PR stages.
---

# Open PR

Use this skill for every PR-opening request. If the user asks to "use the skill" in a
PR-opening context, this is the skill.

## Hard requirements

- Use GitHub MCP for PR/issue metadata: opening or updating pull requests, adding PR
  comments, and inspecting remote branches or files. Do not use `gh` for operations
  GitHub MCP provides; `gh` is a human-approved fallback only for operations MCP
  lacks (for example merging a PR).
- Publish local commits with native `git push` to a branch matching the allowed
  prefixes (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`,
  `deps/`). Do not re-create local commits remotely with `mcp__github__push_files`
  or `create_or_update_file` - inline re-typing loses commit history and risks
  silent content drift. Reserve those MCP write tools for small changes with no
  local commit.
- Never push to `master`, `develop`, `staging`, `bb_develop`, or any environment
  branch - via git, `gh`, or GitHub MCP. Never force-push a branch not created in
  the current task without explicit human approval.
- `git fetch` and `git pull` are allowed for syncing remote state. Local git
  operations remain allowed: `git status`, `git diff`, `git log`, `git add`, and
  `git commit`.
- Do not open the PR until every required `make cc <affected-service>` command passes.
- Do not manually bump app versions, version files, or changelogs in feature PRs unless
  the human explicitly asks for a release/versioning change.
- Do not open the PR for endpoint changes until the matching Bruno collection entries
  and Swagger/OpenAPI schema metadata are updated.
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

## Release Please

Release Please owns app SemVer updates and changelog generation. Ordinary feature, fix,
docs, test, refactor, CI, and dependency PRs must not edit these files only to bump a
version:

- `apps/languee-back/version.txt`
- `apps/languee-back/CHANGELOG.md`
- `apps/languee-back/src/modules/health/health.service.ts`
- `apps/languee-nlp/version.txt`
- `apps/languee-nlp/CHANGELOG.md`
- `apps/languee-nlp/src/languee_nlp/constants.py`
- `apps/languee-droid/version.txt`
- `apps/languee-droid/CHANGELOG.md`
- `apps/languee-droid/app/build.gradle.kts` when changing only `versionName`

Use release-please-compatible Conventional Commits so release PRs can derive the correct
SemVer bump: `fix` and `deps` for patch, `feat` for minor, and `!` or a
`BREAKING CHANGE` footer for major. Android `versionCode` is not a SemVer field; change
it only for an explicit release/publication task or dedicated automation.

## Endpoint documentation

If the PR adds or updates an HTTP endpoint, request/response shape, query or path
parameter, auth requirement, status code, or error response, update the API artifacts
before opening the PR:

- `languee-back`: update the relevant Bruno requests under `apps/languee-back/bruno/`
  and keep NestJS Swagger metadata current with controller decorators, DTO
  `@ApiProperty`/`@ApiPropertyOptional` fields, response decorators, auth decorators,
  and error/status documentation.
- `languee-nlp`: update the relevant Bruno requests under `apps/languee-nlp/bruno/`
  and keep FastAPI OpenAPI metadata current with route summaries/descriptions, tags,
  request/response Pydantic schemas, status codes, and error responses.

The Bruno request must exercise the new or changed contract with realistic local
environment variables. The Swagger/OpenAPI schema must describe the actual shipped
contract; do not rely on stale generated docs or incomplete DTO/schema annotations.

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
  (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`, or `deps/`)
- Title: Conventional Commit format
- Body: include the spec description, target service or services, affected
  modules/components, release impact, and QA summary

After opening the PR through GitHub MCP, add a PR comment linking the source Notion spec
when one exists:

```text
Notion spec: <spec.notion_url>
```

For Forge runs, write the PR URL back to Notion `Agent output`, set the final Notion
status as instructed by the pipeline, and clean up the worktree only after the PR is
opened successfully.
