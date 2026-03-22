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

Before running any command that requires environment variables, load `.env` from the
monorepo root:

```bash
set -a && source .env && set +a
```

Avoid using ${VAR} shell expansion in commands. Prefer `printenv VAR` or plain `$VAR`.
Avoid using brace expansion {} in shell commands. List files explicitly or run separate commands instead.

Do this at the start of every session and before every pipeline run — never assume
environment variables are already exported.

## Agent behaviour rules

- Never install new packages without stating which package and why
- Never modify `prisma/schema.prisma` without also generating a migration
- Never skip tests — if a feature has no test file, create one
- Never leave `TODO` comments in committed code
- Always run lint before declaring a task done
- When a task touches the DB, validate migration runs cleanly on a fresh schema

## Forge pipeline

Two pipelines triggered from Claude Code slash commands:

| Pipeline | Command        | Agent chain                                       |
| -------- | -------------- | ------------------------------------------------- |
| Feature  | `/forge`       | Lead → Architect → Implementer → Linter → QA → PR |
| Infra    | `/forge-infra` | DevOps                                            |

Notion specs filtered by `Pipeline` (`feature` or `infra`) and `Status` = `ready-for-dev`.

### Agent roles

- **Lead**: orchestrates the feature pipeline, reads Notion, persists outputs, opens PR
- **Architect**: reviews spec, designs schema, writes implementation plan — no code
- **Implementer**: executes Architect's plan, writes NestJS code and migrations — no tests, no lint
- **Linter**: runs `yarn lint` and `yarn format`, fixes errors — no logic changes
- **QA**: writes tests, verifies lint, validates migrations, reviews code — no fixes
- **DevOps**: owns `docker-compose.yml` and `Makefile` at root, each app's `Dockerfile` — no app code
