# /forge-refactor

Run the Languee refactor pipeline for all specs with status `ready-for-dev` AND
pipeline `refactor` in Notion.

## What this command does

Executes structural and logic refactoring in sequence for the target service, then
verifies integrity via Linter and QA. Does not invoke Lead, Architect, or Implementer.

## Pipeline order

Restructurer (Haiku) → Decomposer (Sonnet) → Linter → QA

Each stage is conditional:
- Restructurer runs only if the spec includes renames, moves, or import updates
- Decomposer runs only if the spec includes splits, extractions, or encapsulation changes
- Linter always runs
- QA always runs

## Steps

1. Read `forge/config.py` for pipeline configuration
2. Check `NOTION_SPEC_DB_ID` is set — abort with a clear message if not
3. Query Notion for entries where:
   - `Status` = `ready-for-dev`
   - `Pipeline` = `refactor`
   - `Target` select is one of the known keys from `config.services`
4. If no specs found, print: "No specs with status ready-for-dev and pipeline refactor
   found in Notion. Nothing to run." and stop
5. For each spec, build `target_service` from `forge/config.py` and pass it to every agent
6. If a spec is missing `Target` or references an unknown target, mark it
   `pending-more-info` and ask for the target service
7. For each valid spec:
   a. Create run directory at `forge/runs/<spec-title-kebab-case>/`
   b. Update Notion status to `in-progress`
   c. Dispatch Restructurer if spec requires it — persist to
      `forge/runs/<spec-title-kebab-case>/restructurer-output.json`
   d. Dispatch Decomposer if spec requires it, passing `restructurer_output` — persist
      to `forge/runs/<spec-title-kebab-case>/decomposer-output.json`
   e. Dispatch Linter — persist to `forge/runs/<spec-title-kebab-case>/linter-output.json`
   f. Dispatch QA — persist to `forge/runs/<spec-title-kebab-case>/qa-output.json`
   g. On QA done: update Notion to `done`, open PR, write PR URL to `Agent output`
   h. On any `needs_revision`: update Notion to `failed`, write stage and reason to
      `Agent output`

Validate every agent output with `forge/output_gateway.py` before persisting it as the
canonical output file or passing it to the next agent. If validation fails, run a
localized repair turn with the same agent and do not forward the invalid output.

## On completion

Print a final summary listing:
- Specs processed
- Which succeeded (with PR URL)
- Which failed (with stage and reason)

## Usage

```
/forge-refactor
```

Dry run:

```
FORGE_DRY_RUN=true /forge-refactor
```
