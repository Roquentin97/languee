# Languee - agent context

## Project layout

This is a monorepo. Application services live under `apps/`.

Current services:

- `apps/languee-back/` - NestJS API service
- `apps/languee-nlp/` - FastAPI spaCy wrapper service
- `apps/languee-droid/` - Kotlin Android app

All file operations, commands, and imports must be relative to the target service path
for the current spec unless stated otherwise. The target service comes from the Notion
`Target` select field and is also passed to agents as `target_service`.

Each app owns its own `Dockerfile` and `.dockerignore` inside its directory.
`docker-compose.yml` and `Makefile` live at the monorepo root and orchestrate all apps
regardless of their language or runtime.

Agent tooling lives in `.claude/` and `forge/` at the monorepo root - never inside `apps/`.

## Service selection

Every spec consumed by Forge must identify its target service in the Notion `Target`
select field. Valid target values are defined in `forge/config.py`.

- `languee-back` targets `apps/languee-back`
- `languee-nlp` targets `apps/languee-nlp`
- `languee-droid` targets `apps/languee-droid`

If a feature crosses service boundaries, the spec must explicitly describe the contract
between services. The Architect must halt with `pending_more_info` when the service
contract, ownership boundary, request shape, response shape, timeout behavior, or error
mapping is unspecified.

When a spec refers to HTTP endpoints, or when a service contract is needed, agents must
consult the corresponding provider service's Swagger docs when available:

- `languee-nlp`: `http://localhost:8000/docs`
- `languee-back`: `http://localhost:3000/api/v1/docs`

These URLs use default local ports. Ports may be environment-dependent; check
`forge/services.toml`, generated `agent-instructions.md`, and port environment variables
such as `LANGUEE_NLP_PORT` or `LANGUEE_BACK_API_PORT`. If the service or docs endpoint is
unavailable, note that explicitly in the output and fall back to analyzing endpoints from
source routers/controllers, DTOs, schemas, and tests.

## Service Manifests and Rules

Service facts, commands, context include/exclude patterns, ruleset selection, and
service-specific environment variables live in `forge/services.toml`.

Human-readable stack rules live in `.claude/rules/`:

- `common.md` - shared monorepo, context, ambiguity, environment, branch, and commit rules
- `boundary.md` - cross-service contract rules
- `nestjs.md` - NestJS and TypeScript conventions
- `prisma.md` - Prisma and persistence conventions
- `jest.md` - Jest testing conventions
- `fastapi.md` - FastAPI, Python, and uv conventions
- `spacy.md` - spaCy model and provider conventions
- `pytest.md` - pytest and FastAPI API-test conventions
- `android-kotlin.md` - Android, Kotlin, Gradle, UI, and app testing conventions

Lead assembles `forge/runs/<spec-slug>/context/agent-instructions.md` from the target
service's `rulesets` before dispatching subagents. Agent prompts should read that generated
file instead of duplicating stack rules for every service.

## Notion context hierarchy

Specs can optionally reference a context page via the `Context` relation field.
Context pages live in a dedicated `Contexts` database with fields:

- `Title` - name of the stage, pipeline, or grouping
- `Description` - free-form description of the broader goal and constraints
- `Parent context` - self-referential relation to another context page (optional)

This forms an unrestricted hierarchy. Examples:

- Spec -> Stage context -> Pipeline context
- Spec -> Step context -> Stage context -> Pipeline context
- Spec (no context - standalone task)

The Architect walks the full chain from the spec's context up to the root before
designing anything. Every decision must be consistent with the full chain.
Add `NOTION_CONTEXT_DB_ID` to `.env` with the Contexts database ID.

## Ambiguity policy

The pipeline never makes assumptions about:

- Target service when a spec could apply to multiple services
- Future schemas, models, or API contracts not yet defined
- Contracts with services or modules that do not exist yet
- Business logic not explicitly stated in the spec
- Integration points with external systems unless fully described

If any of the above are required to complete a task and are not defined in the spec,
the pipeline must stop immediately, set Notion status to `pending-more-info`, and write
specific questions to `Agent output`. Never proceed on assumptions.

The Architect is the primary gate - it must raise ambiguities before any code is written.
If the Implementer encounters an assumption mid-task, it must also halt and return
`needs_revision` with a clear explanation rather than guessing.

## Parallel pipeline conventions

The Lead agent manages one git worktree per spec at `../<repo-name>-<spec-slug>/`.
Worktrees are created before the pipeline starts and removed after PR is opened or on failure.
Never manually delete worktrees while a pipeline is running - use `git worktree list` to
check active worktrees and `git worktree remove` to clean up orphans.

Before dispatching feature agents, Lead generates target-specific context artifacts under
`forge/runs/<spec-slug>/context/`:

- `agent-instructions.md` - common rules plus only the target service's selected rulesets
- `repo-skeleton.md` - compact architecture map with function and method bodies omitted
- `context-manifest.json` - file list, compaction mode, and size metadata
- `compaction-stats.json` - aggregate reduction statistics

Use `agent-instructions.md` as the target-specific source of truth for a run. Use skeleton
artifacts for broad orientation only. Agents must read full source files before editing
code, reviewing behavior, designing persistence changes, writing tests, or making
decisions that depend on implementation details.

`forge/migration.lock` serialises Prisma migrations for services that use Prisma.
If a pipeline crashes without releasing the lock, delete it manually:

```bash
rm forge/migration.lock
```

If a machine goes down mid-pipeline, specs may be stuck in `in-progress` and worktrees
may be left orphaned. Run `/forge-recovery` before resuming any pipeline work.

## Branch conventions

Agents may only push to branches with these prefixes:
`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`, `deps/`

Never push directly to `master`, `develop`, `staging`, or any environment branch - via bash or GitHub MCP.
When using `mcp__github__push_files` or `mcp__github__create_branch`, apply the same
branch prefix rules. Never pass `master`, `develop`, or `staging` as the branch argument.
Branch name must match the conventional commit type of the change.

## GitHub remote operations

Remote operations are split into two planes:

- **Metadata plane - GitHub MCP.** Opening or updating pull requests, PR comments,
  issues, and inspecting remote branches or files go through GitHub MCP, not `gh`.
  `gh` remains a human-approved fallback only for operations MCP lacks (for example
  merging a PR).
- **Code plane - native git.** `git fetch` and `git pull` are always allowed for
  syncing remote state. `git push` is allowed ONLY to branches matching the allowed
  prefixes (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`,
  `deps/`) and is the REQUIRED way to publish local commits. Do not re-create local
  commits remotely with `mcp__github__push_files` or `create_or_update_file`:
  inline re-typing loses commit history and risks silent content drift (see PR #77).
  Reserve those MCP write tools for small changes that have no local commit.

Never push to `master`, `develop`, `staging`, `bb_develop`, or any environment
branch - via git, `gh`, or GitHub MCP. Never force-push a branch that was not
created in the current task without explicit human approval.

## PR opening skill

Whenever the human asks to open, create, publish, or prepare a PR, or asks to "use the
skill" in a PR-opening context, Claude must use `.claude/skills/open-pr/SKILL.md`.
Forge PR stages must also use that skill. The skill is required because it enforces
the remote-operations policy above, release-please-compatible PR metadata,
`make cc <affected-service>` for each affected service, and PR/Notion bookkeeping.
Do not manually bump app versions or changelogs in feature PRs; Release Please owns
version and changelog updates through generated release PRs.

## Commit and PR conventions

All commits must follow Conventional Commits format:

```text
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `deps`, `chore`, `docs`, `refactor`, `test`, `ci`
Scope: the service, module, or area affected e.g. `auth`, `users`, `languee-nlp`,
`languee-droid`, `docker`, `prisma`

Examples:

- `feat(auth): add JWT refresh token rotation`
- `feat(languee-nlp): add lemma endpoint`
- `feat(languee-droid): add login screen state`
- `fix(users): handle null result from findByEmail`
- `chore(docker): add nlp service healthcheck`
- `deps(languee-back): update prisma`
- `test(auth): add edge cases for expired access token`

PR titles follow the same format as commit messages.
Commit messages are enforced via `commitlint` + `husky` at the `commit-msg` hook level.
Agents must produce valid conventional commit messages - the hook will reject anything else.
Release Please derives release impact from these messages: `fix` and `deps` trigger patch
releases, `feat` triggers minor releases, and `!` or a `BREAKING CHANGE` footer triggers
major releases. Do not hide user-facing fixes or features behind `chore`.
PR body must include: spec description, target service, affected modules/components,
release impact, and QA summary.

## Environment

Before running any command that requires environment variables, use the wrapper script
from the monorepo root:

```bash
sh scripts/load-env.sh <your-command>
```

For example:

```bash
sh scripts/load-env.sh yarn prisma migrate dev
sh scripts/load-env.sh uv run pytest
```

Avoid using `${VAR}` shell expansion in commands. Prefer `printenv VAR` or plain `$VAR`.
Avoid using brace expansion `{}` in shell commands. List files explicitly or run separate commands instead.

Never assume environment variables are already exported - always use the wrapper.

## Agent behaviour rules

- Never install new packages without stating which package and why
- Follow the generated `agent-instructions.md` for target-service persistence, API
  documentation, and testing rules
- Never skip tests - if a feature has no test file, create one
- Never leave `TODO` comments in committed code
- Always run the target service lint command before declaring a task done
- Run noisy local commands through `forge/command_summary.py`; persist raw logs under
  `forge/runs/<spec-slug>/logs/` and forward only compact summaries to agents
- Validate agent handoff JSON with `forge/output_gateway.py` before persisting canonical
  outputs or forwarding data to another agent
- When a task touches the DB, validate migration runs cleanly on a fresh schema

## Forge pipeline

| Pipeline | Command           | Agent chain                                                   |
| -------- | ----------------- | ------------------------------------------------------------- |
| Feature  | `/forge`          | Lead -> Architect -> Implementer -> Linter -> QA -> open-pr skill |
| Infra    | `/forge-infra`    | DevOps                                                        |
| Refactor | `/forge-refactor` | Restructurer -> Decomposer -> Linter -> QA -> open-pr skill   |
| Feedback | `/forge-feedback` | Lead (infers stage) -> agents -> GitHub MCP update to existing PR |
| Recovery | `/forge-recovery` | Detects stuck specs, orphaned worktrees, held migration locks |

Notion specs filtered by `Pipeline` (`feature`, `infra`, or `refactor`) and `Status` = `ready-for-dev`.
Feedback pipeline additionally queries `needs-revision` and `pending-more-info` statuses.

### Agent roles

- **Lead**: orchestrates the feature pipeline, reads Notion, selects target service, persists outputs, opens PR through the open-pr skill
- **Architect**: reviews spec, designs service-specific contracts and persistence changes, writes implementation plan - no code
- **Implementer**: executes Architect's plan, writes target-service code and persistence artifacts - no tests, no lint
- **Linter**: runs target-service lint/format commands, fixes lint errors - no logic changes
- **QA**: writes tests, verifies lint, validates persistence artifacts, reviews code - no fixes
- **Restructurer**: renames, moves, import updates - Haiku, no logic changes
- **Decomposer**: splits, extractions, encapsulation - Sonnet, no renames or moves
- **DevOps**: owns `docker-compose.yml` and `Makefile` at root, each app's `Dockerfile` - no app code
