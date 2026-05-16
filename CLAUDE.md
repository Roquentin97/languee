# Languee - agent context

## Project layout

This is a monorepo. Application services live under `apps/`.

Current services:

- `apps/languee-back/` - NestJS API service
- `apps/languee-nlp/` - FastAPI spaCy wrapper service

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

If a feature crosses service boundaries, the spec must explicitly describe the contract
between services. The Architect must halt with `pending_more_info` when the service
contract, ownership boundary, request shape, response shape, timeout behavior, or error
mapping is unspecified.

## App: apps/languee-back

### Stack

- **Runtime**: Node.js, TypeScript (strict)
- **Framework**: NestJS 11
- **Database**: PostgreSQL via Prisma
- **Cache**: Redis
- **Test runner**: Jest (`yarn test`, `yarn test:e2e`)
- **Package manager**: Yarn

### TypeScript rules

- Never use `any` - use `unknown` and narrow it
- Always handle null/undefined explicitly (`strictNullChecks`)
- No const enums, no namespace merging (`isolatedModules`)
- `emitDecoratorMetadata` + `experimentalDecorators` are required for NestJS DI

### Linting and formatting

- ESLint 9 flat config with `typescript-eslint` recommended type-checked rules
- Prettier with single quotes and trailing commas
- `yarn lint` auto-fixes on run - must pass with zero errors before any task is done
- `yarn format` for formatting

### NestJS conventions

- One module per domain - never put logic directly in `AppModule`
- Modules live at `src/modules/<module>/`
- Use constructor injection, never property injection
- DTOs live in `dto/` inside their module folder, validated with `class-validator`
- Never import across domain modules directly - use shared modules or events
- Controllers handle HTTP only - no business logic
- Services own business logic - no Prisma calls in controllers
- Services never call Prisma models belonging to another module - cross-module data
  access must go through that module's service (e.g. `AuthService` calls
  `UsersService.findByEmail()`, never `this.prisma.user.findUnique()` directly)

### Architecture conventions

The backend follows a Controller -> Service architecture by default.

- Controllers handle HTTP only - no business logic
- Controllers call services, not use cases or Prisma directly
- Controllers call serializers for response shaping
- Services own business logic and coordinate persistence
- For simple CRUD operations, controllers should call service methods directly
- Service methods may be implemented by generated Prisma-backed services when appropriate
- Do not introduce a separate service just to host read-only pass-through methods
- If a service grows beyond 3 public methods that involve orchestration, the Architect
  may suggest refactoring orchestration into use cases
- Avoid introducing heavy Clean Architecture layers unless the module complexity justifies them

### Services, serializers, and persistence

We do not use repositories. Services are the module boundary for business logic and
persistence access.

- Service classes follow the `<Entity>Service` naming convention
- Do not create `<Entity>PrismaService` classes
- Prisma calls remain behind module-owned services; never call Prisma directly from controllers
- Services never call Prisma models belonging to another module - cross-module data
  access must go through that module's service
- Domain services may use Prisma internally, but they should expose business-oriented
  methods rather than raw persistence operations
- Controllers must not create response DTOs directly
- Each module should use its `serializers/` folder for response shaping and DTO serialization

### core/ conventions

`core/` is for infrastructure with zero domain coupling.
Rule: if removing any domain module would break something in `core/`, it does not belong there.

- `pipes/` - `ValidationPipe` configuration, custom transformation pipes
- `decorators/` - generic cross-cutting decorators: `@Public()`, `@Roles()`

### Auth module conventions

Domain-specific infrastructure lives inside the module that owns it:

- `auth/guards/` - `JwtAuthGuard` and any other auth guards
- `auth/decorators/` - `@CurrentUser()` and auth-specific parameter decorators
- `auth/strategies/` - Passport JWT strategy

Other modules apply auth guards via `@UseGuards(JwtAuthGuard)` importing from
`auth/guards/` - they never reimplement auth logic.

### Prisma conventions

- Schema at `apps/languee-back/prisma/schema.prisma`
- Never modify the DB directly - always via `yarn prisma migrate dev`
- Run `yarn prisma generate` after every schema change before touching service code
- Model names are PascalCase singular (`User`, not `users`)
- Always define `@relation` on both sides of a relation

### Testing conventions

- Unit tests: `*.spec.ts` co-located with source file
- E2E tests: `test/` directory, `*.e2e-spec.ts`
- Mock Prisma with `jest.mock` - never hit real DB in unit tests
- Every service method needs at least one happy path and one edge case test
- Coverage threshold: 80% per service

## App: apps/languee-nlp

### Stack

- **Runtime**: Python 3.12+
- **Framework**: FastAPI
- **NLP**: spaCy
- **Package manager**: uv
- **Test runner**: pytest
- **Linting/formatting**: Ruff

### Python and uv rules

- Dependencies live in `apps/languee-nlp/pyproject.toml`
- Lock dependencies with `apps/languee-nlp/uv.lock`
- Use `uv sync` to install dependencies
- Run commands with `uv run`, never by assuming a globally activated virtualenv
- Keep runtime dependencies and development dependencies separate in `pyproject.toml`
- Do not add packages without stating which package and why

### FastAPI conventions

- Keep the FastAPI app importable from a stable module path, e.g. `languee_nlp.main:app`
- HTTP route handlers should be thin: validate input, call the NLP service layer, return response models
- Pydantic models own request and response validation/serialization
- spaCy model loading belongs behind a small service/provider abstraction, not directly in route handlers
- Health/readiness endpoints must not require a heavy NLP operation unless the spec explicitly asks for it
- Error responses must be deliberate and documented in the Architect plan
- Do not add persistence to this service unless the spec explicitly requires it

### spaCy conventions

- The spaCy model name must be configured through environment or service settings, not hardcoded in route handlers
- Load the model once per application process where practical
- If a feature needs a specific language model, the spec must name it
- Tests should avoid depending on large model downloads unless the spec requires full-model behavior
- For unit tests, prefer mocking the NLP provider or using a lightweight deterministic fixture

### Testing conventions

- Unit and API tests live under `apps/languee-nlp/tests/`
- Use pytest
- Use FastAPI `TestClient` or `httpx` for endpoint tests
- Cover happy paths, validation failures, empty text, unsupported language/model behavior,
  model-load failures, and mapped spaCy exceptions when relevant
- Coverage threshold: 80% for service-layer code unless the spec says otherwise

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

`forge/migration.lock` serialises Prisma migrations for services that use Prisma.
If a pipeline crashes without releasing the lock, delete it manually:

```bash
rm forge/migration.lock
```

If a machine goes down mid-pipeline, specs may be stuck in `in-progress` and worktrees
may be left orphaned. Run `/forge-recovery` before resuming any pipeline work.

## Branch conventions

Agents may only push to branches with these prefixes:
`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`

Never push directly to `master`, `develop`, `staging`, or any environment branch - via bash or GitHub MCP.
When using `mcp__github__push_files` or `mcp__github__create_branch`, apply the same
branch prefix rules. Never pass `master`, `develop`, or `staging` as the branch argument.
Branch name must match the conventional commit type of the change.

## Commit and PR conventions

All commits must follow Conventional Commits format:

```text
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
Scope: the service, module, or area affected e.g. `auth`, `users`, `languee-nlp`,
`docker`, `prisma`

Examples:

- `feat(auth): add JWT refresh token rotation`
- `feat(languee-nlp): add lemma endpoint`
- `fix(users): handle null result from findByEmail`
- `chore(docker): add nlp service healthcheck`
- `test(auth): add edge cases for expired access token`

PR titles follow the same format as commit messages.
Commit messages are enforced via `commitlint` + `husky` at the `commit-msg` hook level.
Agents must produce valid conventional commit messages - the hook will reject anything else.
PR body must include: spec description, target service, affected modules/components, and QA summary.

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
- Never modify `apps/languee-back/prisma/schema.prisma` without also generating a migration
- Always update the Bruno collection in `apps/languee-back/bruno/` when adding or changing
  NestJS API requests
- For `apps/languee-nlp`, update API tests and documented endpoint contracts when adding
  or changing FastAPI requests
- Never skip tests - if a feature has no test file, create one
- Never leave `TODO` comments in committed code
- Always run the target service lint command before declaring a task done
- When a task touches the DB, validate migration runs cleanly on a fresh schema

## Forge pipeline

| Pipeline | Command           | Agent chain                                                   |
| -------- | ----------------- | ------------------------------------------------------------- |
| Feature  | `/forge`          | Lead -> Architect -> Implementer -> Linter -> QA -> PR        |
| Infra    | `/forge-infra`    | DevOps                                                        |
| Refactor | `/forge-refactor` | Restructurer -> Decomposer -> Linter -> QA -> PR              |
| Feedback | `/forge-feedback` | Lead (infers stage) -> relevant agents -> push to existing PR |
| Recovery | `/forge-recovery` | Detects stuck specs, orphaned worktrees, held migration locks |

Notion specs filtered by `Pipeline` (`feature`, `infra`, or `refactor`) and `Status` = `ready-for-dev`.
Feedback pipeline additionally queries `needs-revision` and `pending-more-info` statuses.

### Agent roles

- **Lead**: orchestrates the feature pipeline, reads Notion, selects target service, persists outputs, opens PR
- **Architect**: reviews spec, designs service-specific contracts and persistence changes, writes implementation plan - no code
- **Implementer**: executes Architect's plan, writes target-service code and persistence artifacts - no tests, no lint
- **Linter**: runs target-service lint/format commands, fixes lint errors - no logic changes
- **QA**: writes tests, verifies lint, validates persistence artifacts, reviews code - no fixes
- **Restructurer**: renames, moves, import updates - Haiku, no logic changes
- **Decomposer**: splits, extractions, encapsulation - Sonnet, no renames or moves
- **DevOps**: owns `docker-compose.yml` and `Makefile` at root, each app's `Dockerfile` - no app code
