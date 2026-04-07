# /forge-infra

Run the infrastructure pipeline for all specs with status `ready-for-dev` and pipeline
`infra` in Notion. Uses the DevOps agent instead of the feature pipeline.

## What this command does

Reads the DevOps agent from `.claude/agents/devops.md` and executes infrastructure changes.
No Architect, Implementer, Linter or QA involved — DevOps agent works autonomously.

## Steps

1. Read `.claude/agents/devops.md`
2. Read `forge/config.py` for pipeline configuration
3. Check `NOTION_SPEC_DB_ID` is set — abort with a clear message if not
4. Query Notion for entries where:
   - `Status` = `ready-for-dev`
   - `Pipeline` = `infra`
5. If no specs are found, print: "No specs with status ready-for-dev and pipeline infra
   found in Notion. Nothing to run." and stop
6. Otherwise dispatch the DevOps agent for each matching spec
7. Persist output to `forge/runs/<spec-title-kebab-case>/devops-output.json`
8. On success: update Notion status to `done`, write summary to `Agent output`
9. On failure: update Notion status to `failed`, write reason to `Agent output`

## Usage

```
/forge-infra
```

Dry run:

```
FORGE_DRY_RUN=true /forge-infra
```
