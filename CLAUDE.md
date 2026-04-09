# Languee — agent context

## Project layout

This is a monorepo. The backend lives at `apps/languee-back/`.
All file operations, commands, and imports are relative to that path unless stated otherwise.

Each app owns its own `Dockerfile` and `.dockerignore` inside its directory.
`docker-compose.yml` and `Makefile` live at the monorepo root and orchestrate all apps
regardless of their language or runtime.

Agent tooling lives in `.claude/` and `forge/` at the monorepo root — never inside `apps/`.

## Stack

- **Runtime**: Node.js, TypeScript (strict)
- **Framework**: NestJS 11
- **Database**: PostgreSQL via Prisma
- **Cache**: Redis
- **Test runner**: Jest (`yarn test`, `yarn test:e2e`)
- **Package manager**: Yarn

## TypeScript rules

- Never use `any` — use `unknown` and narrow it
- Always handle null/undefined explicitly (`strictNullChecks`)
- No const enums, no namespace merging (`isolatedModules`)
- `emitDecoratorMetadata` + `experimentalDecorators` are required for NestJS DI

## Linting and formatting

- ESLint 9 flat config with `typescript-eslint` recommended type-checked rules
- Prettier with single quotes and trailing commas
- `yarn lint` auto-fixes on run — must pass with zero errors before any task is done
- `yarn format` for formatting

## NestJS conventions

- One module per domain — never put logic directly in `AppModule`
- Modules live at `src/modules/<module>/`
- Use constructor injection, never property injection
- DTOs live in `dto/` inside their module folder, validated with `class-validator`
- Never import across domain modules directly — use shared modules or events
- Controllers handle HTTP only — no business logic
- Services own business logic — no Prisma calls in controllers
- Services never call Prisma models belonging to another module — cross-module data
  access must go through that module's service (e.g. `AuthService` calls
  `UsersService.findByEmail()`, never `this.prisma.user.findUnique()` directly)

## core/ conventions

`core/` is for infrastructure with zero domain coupling.
Rule: if removing any domain module would break something in `core/`, it does not belong there.

- `pipes/` — `ValidationPipe` configuration, custom transformation pipes
- `decorators/` — generic cross-cutting decorators: `@Public()`, `@Roles()`

## Auth module conventions

Domain-specific infrastructure lives inside the module that owns it:

- `auth/guards/` — `JwtAuthGuard` and any other auth guards
- `auth/decorators/` — `@CurrentUser()` and auth-specific parameter decorators
- `auth/strategies/` — Passport JWT strategy

Other modules apply auth guards via `@UseGuards(JwtAuthGuard)` importing from
`auth/guards/` — they never reimplement auth logic.

## Prisma conventions

- Schema at `apps/languee-back/prisma/schema.prisma`
- Never modify the DB directly — always via `yarn prisma migrate dev`
- Run `yarn prisma generate` after every schema change before touching service code
- Model names are PascalCase singular (`User`, not `users`)
- Always define `@relation` on both sides of a relation

## Testing conventions

- Unit tests: `*.spec.ts` co-located with source file
- E2E tests: `test/` directory, `*.e2e-spec.ts`
- Mock Prisma with `jest.mock` — never hit real DB in unit tests
- Every service method needs at least one happy path and one edge case test
- Coverage threshold: 80% per service

## Notion context hierarchy

Specs can optionally reference a context page via the `Context` relation field.
Context pages live in a dedicated `Contexts` database with fields:

- `Title` — name of the stage, pipeline, or grouping
- `Description` — free-form description of the broader goal and constraints
- `Parent context` — self-referential relation to another context page (optional)

This forms an unrestricted hierarchy. Examples:

- Spec → Stage context → Pipeline context
- Spec → Step context → Stage context → Pipeline context
- Spec (no context — standalone task)

The Architect walks the full chain from the spec's context up to the root before
designing anything. Every decision must be consistent with the full chain.
Add `NOTION_CONTEXT_DB_ID` to `.env` with the Contexts database ID.

## Ambiguity policy

The pipeline never makes assumptions about:

- Future schemas or models not yet defined
- Contracts with services or modules that do not exist yet
- Business logic not explicitly stated in the spec
- Integration points with external systems unless fully described

If any of the above are required to complete a task and are not defined in the spec,
the pipeline must stop immediately, set Notion status to `pending-more-info`, and write
specific questions to `Agent output`. Never proceed on assumptions.

The Architect is the primary gate — it must raise ambiguities before any code is written.
If the Implementer encounters an assumption mid-task, it must also halt and return
`needs_revision` with a clear explanation rather than guessing.

## Parallel pipeline conventions

The Lead agent manages one git worktree per spec at `../<repo-name>-<spec-slug>/`.
Worktrees are created before the pipeline starts and removed after PR is opened or on failure.
Never manually delete worktrees while a pipeline is running — use `git worktree list` to
check active worktrees and `git worktree remove` to clean up orphans.

`forge/migration.lock` serialises Prisma migrations across parallel pipelines.
If a pipeline crashes without releasing the lock, delete it manually:

```bash
rm forge/migration.lock
```

If a machine goes down mid-pipeline, specs may be stuck in `in-progress` and worktrees
may be left orphaned. Run `/forge-recovery` before resuming any pipeline work.

## Branch conventions

Agents may only push to branches with these prefixes:
`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`

Never push directly to `master`, `develop`, `staging`, or any environment branch — via bash or GitHub MCP.
When using `mcp__github__push_files` or `mcp__github__create_branch`, apply the same
branch prefix rules. Never pass `master`, `develop`, or `staging` as the branch argument.
Branch name must match the conventional commit type of the change.

## Commit and PR conventions

All commits must follow Conventional Commits format:

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
Scope: the module or area affected e.g. `auth`, `users`, `docker`, `prisma`

Examples:

- `feat(auth): add JWT refresh token rotation`
- `fix(users): handle null result from findByEmail`
- `chore(docker): add healthcheck to postgres service`
- `test(auth): add edge cases for expired access token`

PR titles follow the same format as commit messages.
Commit messages are enforced via `commitlint` + `husky` at the `commit-msg` hook level.
Agents must produce valid conventional commit messages — the hook will reject anything else.
PR body must include: spec description, affected modules, and QA summary.

## Environment

Before running any command that requires environment variables, use the wrapper script
from the monorepo root:

```bash
sh scripts/load-env.sh <your-command>
```

For example:

```bash
sh scripts/load-env.sh yarn prisma migrate dev
```

Avoid using ${VAR} shell expansion in commands. Prefer `printenv VAR` or plain `$VAR`.
Avoid using brace expansion {} in shell commands. List files explicitly or run separate commands instead.

Never assume environment variables are already exported — always use the wrapper.

## Agent behaviour rules

- Never install new packages without stating which package and why
- Never modify `prisma/schema.prisma` without also generating a migration
- Never skip tests — if a feature has no test file, create one
- Never leave `TODO` comments in committed code
- Always run lint before declaring a task done
- When a task touches the DB, validate migration runs cleanly on a fresh schema

## Forge pipeline

| Pipeline | Command           | Agent chain                                                   |
| -------- | ----------------- | ------------------------------------------------------------- |
| Feature  | `/forge`          | Lead → Architect → Implementer → Linter → QA → PR             |
| Infra    | `/forge-infra`    | DevOps                                                        |
| Refactor | `/forge-refactor` | Restructurer → Decomposer → Linter → QA → PR                  |
| Feedback | `/forge-feedback` | Lead (infers stage) → relevant agents → push to existing PR   |
| Recovery | `/forge-recovery` | Detects stuck specs, orphaned worktrees, held migration locks |

Notion specs filtered by `Pipeline` (`feature`, `infra`, or `refactor`) and `Status` = `ready-for-dev`.
Feedback pipeline additionally queries `needs-revision` and `pending-more-info` statuses.

### Agent roles

- **Lead**: orchestrates the feature pipeline, reads Notion, persists outputs, opens PR
- **Architect**: reviews spec, designs schema, writes implementation plan — no code
- **Implementer**: executes Architect's plan, writes NestJS code and migrations — no tests, no lint
- **Linter**: runs `yarn lint` and `yarn format`, fixes errors — no logic changes
- **QA**: writes tests, verifies lint, validates migrations, reviews code — no fixes
- **Restructurer**: renames, moves, import updates — Haiku, no logic changes
- **Decomposer**: splits, extractions, encapsulation — Sonnet, no renames or moves
- **DevOps**: owns `docker-compose.yml` and `Makefile` at root, each app's `Dockerfile` — no app code
