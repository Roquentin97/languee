# /forge-recovery

Diagnose and recover from interrupted pipeline runs caused by machine shutdown,
crashes, or other unexpected interruptions. Detects stuck specs, orphaned worktrees,
and held migration locks — then cleans up and resets to a runnable state.

Run this manually after a machine restart or unexpected interruption before running
any other forge command.

## What this command does

1. Detects specs stuck in `in-progress` for more than 30 minutes
2. Detects orphaned git worktrees left by interrupted pipelines
3. Detects a held `forge/migration.lock` with no active pipeline
4. Resets all of the above to a clean runnable state

## Steps

### 1. Check for stuck specs

Query Notion for entries where:

- `Status` = `in-progress`
- `Last run` timestamp is more than 30 minutes ago

For each stuck spec:

- Print spec title, last run timestamp, and how long it has been stuck
- Append to `Agent output`: `[forge-recovery] Reset from in-progress after interruption on <timestamp>`
- Reset Notion status to `ready-for-dev`

The Lead agent will handle the rest when `/forge` or `/forge-feedback` is next run —
it checks for existing partial outputs and feedback before deciding how to proceed.

If no stuck specs found, print: "No stuck specs found."

### 2. Check for orphaned worktrees

Run:

```bash
git worktree list
```

Identify any worktrees at paths matching `../<repo-name>-*` that are not associated
with an actively running pipeline.

For each orphaned worktree:

- Read all files in `forge/runs/<spec-slug>/` from inside the worktree and print a
  summary of which agent outputs exist — this gives the human visibility into how far
  the interrupted pipeline got before copying the run directory to the main repo
- Copy `forge/runs/<spec-slug>/` from the worktree into the main repo's `forge/runs/`
  so the Lead agent can read partial outputs on next run
- Remove the worktree:
  ```bash
  git worktree remove <path> --force
  ```
- Do not delete the remote branch — the Lead agent will push to it on resume

If no orphaned worktrees found, print: "No orphaned worktrees found."

### 3. Check for held migration lock

Check if `forge/migration.lock` exists.

If it exists:

- Print the spec slug written in the lock file
- Delete the lock:
  ```bash
  rm forge/migration.lock
  ```
- Print: "Migration lock released."

If no lock found, print: "No migration lock held."

### 4. Print recovery summary

After all steps complete, print:

- How many specs were reset to `ready-for-dev`
- How many worktrees were removed and their run outputs copied
- Whether the migration lock was released
- Next steps: "Run /forge to resume specs with no prior feedback. Run /forge-feedback
  to resume specs with existing feedback."

## Rules

- Never reset a spec that has been `in-progress` for less than 30 minutes
- Never delete a worktree branch — Lead will push to it on resume
- Always copy run outputs from the worktree before removing it
- Always print what was found and what was changed — never act silently
- If FORGE_DRY_RUN is true, print what would be changed but do not apply any changes

## Usage

```
/forge-recovery
```

Dry run:

```
FORGE_DRY_RUN=true /forge-recovery
```
