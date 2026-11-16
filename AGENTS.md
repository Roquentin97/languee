# Languee engineering policy

Languee is a monorepo: `apps/languee-back` is the NestJS API, `apps/languee-nlp` the FastAPI NLP service, and `apps/languee-droid` the Android client. Root Docker Compose and Makefile orchestrate services. Identify affected services from the task and changes; work within their boundaries and inspect full source before changing behavior.

Resolve significant product, data compatibility, ownership and cross-service contract ambiguities with the user. When a change raises a backward-compatibility or existing-data concern, ask whether compatibility must be preserved or test data recreated; do not implement a compatibility layer, migration, or wipe before the answer. Never invent business behavior or contracts. Archived external workspace integrations are inactive.

Read only applicable rules under `.agents/rules/`: backend: `nestjs.md`, tests: `jest.md`, persistence: `prisma.md`; NLP: `fastapi.md`, model work: `spacy.md`, tests: `pytest.md`; Android: `android-kotlin.md`; cross-service contracts: `boundary.md` and rules for affected services. These paths are repository conventions and are not automatically discovered by every harness.

Keep production functions within configured maintainability limits and run lint early. Add relevant tests and run lint and tests for applicable changes. Run `make cc <service>` for every affected service; if shared changes cannot be attributed to a service, validate all three. Validate database migrations against a fresh schema. Update Swagger/OpenAPI and Bruno for changed endpoints. Verify final-head CI for delivery. Use `sh scripts/load-env.sh <command>` for commands requiring environment variables. `forge/services.toml` documents service commands and ports; `forge/command_summary.py` can summarize noisy commands with task-local logs.

Write concise current documentation and comments explaining useful behavior and non-obvious constraints, not change history or obvious code. Do not commit TODOs or secrets. Explain any new package and its purpose before installing it.

Use conventionally named branches with prefixes `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`, or `deps/`; use Conventional Commits (`type(scope): description`). Never push to environment branches. Publish local commits using native git push, and use GitHub MCP for PR and issue metadata. Never force-push a branch not created for the task or merge a PR without explicit authorization. Read `.agents/skills/open-pr/SKILL.md` for PR creation. Do not bump versions or changelogs solely for development build identity.

Delegate bounded tasks to native subagents when useful; no fixed pipeline is required. Coordinate overlapping edits, provide applicable role and service rules explicitly, and return concise evidence rather than bulk logs. The coordinator remains responsible for integration and verification.
