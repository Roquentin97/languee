# /forge

Run the Languee feature pipeline for all specs with status `ready-for-dev` AND
pipeline `feature` in Notion.

## What this command does

Reads the Lead agent from `.claude/agents/lead.md` and executes the full pipeline:
Architect → Implementer → Linter → QA → PR

## Steps

1. Read `.claude/agents/lead.md`
2. Read `forge/config.py` for pipeline configuration
3. Check that `NOTION_SPEC_DB_ID` is set — abort with a clear message if not
4. If `FORGE_DRY_RUN=true`, print a warning that no Notion writes or PRs will be created
5. Query Notion for entries where:
   - `Status` = `ready-for-dev`
   - `Pipeline` = `feature`
6. Execute the Lead agent instructions for each matching spec

## Subagent prompts

Each subagent is spawned using the Task tool with its prompt loaded fresh from:

- `.claude/agents/architect.md`
- `.claude/agents/implementer.md`
- `.claude/agents/linter.md`
- `.claude/agents/qa.md`

## Run output

All agent outputs are persisted to `forge/runs/<spec-title-kebab-case>/` as JSON files.
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
