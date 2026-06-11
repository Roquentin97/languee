# /forge

Run the Languee feature pipeline for all specs with status `ready-for-dev` AND
pipeline `feature` in Notion.

## What this command does

Reads the Lead agent from `.claude/agents/lead.md`, resolves each spec's target service
from the Notion `Target` select field and `forge/config.py`, then executes the full pipeline:
Architect → Implementer → Linter → QA → PR

## Steps

1. Read `.claude/agents/lead.md`
2. Read `forge/config.py` for pipeline configuration
3. Check that `NOTION_SPEC_DB_ID` is set — abort with a clear message if not
4. If `FORGE_DRY_RUN=true`, print a warning that no Notion writes or PRs will be created
5. Query Notion for entries where:
   - `Status` = `ready-for-dev`
   - `Pipeline` = `feature`
   - `Target` select is one of the known keys from `config.services`
6. If no specs found, print: "No specs with status ready-for-dev and pipeline feature
   found in Notion. Nothing to run." and stop
7. If a spec is missing `Target` or references an unknown target, mark it
   `pending-more-info` and ask for the target service
8. Otherwise execute the Lead agent instructions for each matching spec. Lead generates
   target-specific agent instructions and compact context artifacts in
   `forge/runs/<spec-title-kebab-case>/context/` before dispatching Architect.

## Subagent prompts

Each subagent is spawned using the Task tool with its prompt loaded fresh from:

- `.claude/agents/architect.md`
- `.claude/agents/implementer.md`
- `.claude/agents/linter.md`
- `.claude/agents/qa.md`

Each subagent receives a `target_service` object derived from `forge/config.py`.
Dispatched subagents also receive `context_artifacts` paths for generated
`agent-instructions.md`, the compact repository skeleton, manifest, and compaction stats.
`agent-instructions.md` contains only the target service's selected rulesets from
`forge/services.toml`; skeleton artifacts are for broad orientation only.

## Run output

All agent outputs are validated with `forge/output_gateway.py` before being persisted to
`forge/runs/<spec-title-kebab-case>/` as canonical JSON files.
Print a summary to the console after each agent completes.

## On completion

Print a final summary listing:

- Specs processed
- Which succeeded (with PR URL)
- Which failed (with stage and reason)

## Usage

```
/forge
```

Dry run:

```
FORGE_DRY_RUN=true /forge
```
