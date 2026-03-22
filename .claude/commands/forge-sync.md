# /forge-sync

Review structural changes proposed by the Architect across recent pipeline runs and
selectively apply them to `CLAUDE.md`. Human reviews and confirms each change before
it is written.

This command exists because agents should never modify `CLAUDE.md` autonomously —
convention changes require human judgement.

## Steps

1. Scan `forge/runs/` for all `architect-output.json` files that contain a non-empty
   `structure_changes` array
2. Collect all unique proposed changes not yet reflected in `CLAUDE.md`
3. For each proposed change, print:
   - Which spec introduced it
   - What the change is
   - The relevant section of `CLAUDE.md` it would affect
4. Ask the human to confirm, reject, or modify each change before applying
5. For confirmed changes, update the relevant section of `CLAUDE.md` with precise,
   rule-based language — never add directory trees or lists of paths
6. Print a summary of what was applied and what was skipped

## Rules
- Never apply changes without explicit human confirmation
- Never add directory trees to `CLAUDE.md` — only conventions and rules
- Never remove existing rules unless the human explicitly confirms removal
- Keep `CLAUDE.md` entries concise — one rule per concept, no redundancy
- After applying, ask the human to review the diff before committing

## Usage
```
/forge-sync
```
