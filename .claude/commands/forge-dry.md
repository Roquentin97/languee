# /forge-dry

Run the Languee pipeline in dry run mode — no Notion writes, no PRs opened.
Useful for testing pipeline logic and prompt behaviour without side effects.

Equivalent to running `/forge` with `FORGE_DRY_RUN=true`.

## Steps
1. Set `FORGE_DRY_RUN=true`
2. Execute `/forge` exactly as specified in `.claude/commands/forge.md`
3. Print all actions that would have been taken to the console
