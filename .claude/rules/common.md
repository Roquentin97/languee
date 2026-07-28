# Common Forge Rules

## Project Layout

This is a monorepo. Application services live under `apps/`.
Agent tooling lives in `.claude/` and `forge/` at the monorepo root, never inside `apps/`.
All file operations, commands, and imports must be relative to the current
`target_service.path` unless the spec or Architect explicitly allows a root-level or
cross-service change.

## Service Selection

Every Forge spec must identify its target service in the Notion `Target` select field.
Valid target values are defined in `forge/services.toml` and loaded through
`forge/config.py`.

## Context Artifacts

Lead generates compact context artifacts under `forge/runs/<spec-slug>/context/` before
dispatching feature agents:

- `agent-instructions.md` - common rules plus only the target service rulesets
- `repo-skeleton.md` - compact architecture map with function and method bodies omitted
- `context-manifest.json` - file list, compaction mode, and size metadata
- `compaction-stats.json` - aggregate reduction statistics

Use skeleton artifacts for broad orientation only. Read full source files before editing
code, reviewing behavior, designing persistence changes, writing tests, or making
decisions that depend on implementation details.

## Notion Context Hierarchy

Specs can optionally reference a context page via the `Context` relation field.
The Architect walks the full context chain from root to leaf before designing anything.
Every design decision must be consistent with the full chain. If a decision conflicts
with any level of the chain, halt with `pending_more_info` and write a specific question.

## Ambiguity Policy

The pipeline never makes assumptions about target service, future schemas, API
contracts, undefined business logic, missing integration details, or ownership
boundaries. If any assumption is required, halt and ask a specific answerable question.

## Endpoint Documentation

When a spec refers to HTTP endpoints or an agent needs a service contract, check the
corresponding provider service's Swagger docs when the service is available:

- `languee-nlp`: `http://localhost:8000/docs`
- `languee-back`: `http://localhost:3000/api/v1/docs`

These URLs use default local ports. Ports may be environment-dependent; check
`forge/services.toml`, generated `agent-instructions.md`, and port environment variables
such as `LANGUEE_NLP_PORT` or `LANGUEE_BACK_API_PORT`. If the service or docs endpoint is
unavailable, note that explicitly in the agent output and fall back to analyzing
routers/controllers, DTOs, schemas, and tests from source.

## Environment

Before running commands that require environment variables, use the wrapper script from
the monorepo root:

```bash
sh scripts/load-env.sh <your-command>
```

Avoid `${VAR}` shell expansion in commands. Prefer `printenv VAR` or plain `$VAR`.
Avoid brace expansion in shell commands.

## Agent Behavior

- Never install new packages without stating which package and why.
- Never skip tests when the current agent owns tests.
- Never leave `TODO` comments in committed code.
- Always run the target service lint command before declaring a task done when the
  current agent is responsible for verification.
- For local commands that can produce large output, especially package installs, lint,
  format, tests, coverage, migrations, builds, and Docker checks, use
  `forge/command_summary.py`. Raw stdout/stderr should be written to
  `forge/runs/<spec-slug>/logs/`; only compact summaries should be forwarded to agents.
- Agent JSON outputs are validated by `forge/output_gateway.py` before downstream stages
  consume them. Return exactly the schema requested by the agent prompt; malformed
  handoffs trigger a localized repair turn instead of being forwarded.

## Branch, Commit, and PR Rules

Agents may only push to branches with these prefixes:
`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`, `deps/`.

Never push to `master`, `develop`, `staging`, `bb_develop`, or any environment branch -
via git, `gh`, or GitHub MCP.

Use GitHub MCP for PR/issue metadata: opening or updating pull requests, PR comments,
and inspecting remote state. Publish local commits with native `git push` to an
allowed-prefix branch - do not re-create local commits remotely with
`mcp__github__push_files` (inline re-typing loses commit history and risks silent
content drift). `git fetch`/`git pull` are allowed for syncing remote state. Do not
use `gh` for operations GitHub MCP provides; never force-push a branch not created in
the current task without explicit human approval.

Whenever a workflow opens, creates, publishes, or prepares a PR, use
`.claude/skills/open-pr/SKILL.md`. The skill treats shared/root/tooling-only changes as
all-service changes unless the human narrows scope, requires `make cc <affected-service>`
for each affected service before PR creation, and keeps PR metadata compatible with
Release Please. Do not manually bump app versions or changelogs in feature PRs; Release
Please owns version and changelog updates through generated release PRs.

All commits and PR titles must use Conventional Commits:

```text
<type>(<scope>): <description>
```

Allowed types: `feat`, `fix`, `deps`, `chore`, `docs`, `refactor`, `test`, `ci`.
Release Please derives release impact from these messages: `fix` and `deps` trigger patch
releases, `feat` triggers minor releases, and `!` or a `BREAKING CHANGE` footer triggers
major releases. Do not hide user-facing fixes or features behind `chore`.
PR bodies must include spec description, target service, affected modules/components,
release impact, and QA summary.
