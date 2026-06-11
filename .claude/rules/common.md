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
`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `ci/`.

Never push directly to `master`, `develop`, `staging`, or any environment branch.

All commits and PR titles must use Conventional Commits:

```text
<type>(<scope>): <description>
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.
PR bodies must include spec description, target service, affected modules/components,
and QA summary.
