# /forge-feedback

Process human feedback on rejected PRs and re-run the pipeline from the appropriate
stage. Detects specs with status `needs-revision` in Notion, reads feedback, infers
the restart stage, and pushes fixes to the existing PR branch.

## Steps

1. Read `forge/config.py` for pipeline configuration
2. Check `NOTION_SPEC_DB_ID` is set — abort with a clear message if not
3. Query Notion for entries where:
   - `Status` = `needs-revision` OR `pending-more-info`
   - `Pipeline` = `feature`
4. If no specs found, print: "No specs with status needs-revision or pending-more-info found. Nothing to run."
   and stop
5. For `pending-more-info` specs: the human has answered the Architect's questions in
   the `Feedback` field — always restart from Architect so it can incorporate the answers
6. For each spec, read the `Feedback` field and infer the restart stage
7. Print the inferred restart stage and reasoning — ask for confirmation before proceeding
8. Check out the existing feature branch in a new worktree:
   ```bash
   git worktree add ../<repo-name>-<spec-slug>-r<iteration> feature/<spec-slug>
   ```
9. Update Notion status to `in-progress`
10. Increment `Iteration` field by 1
11. Run the pipeline from the inferred stage, passing feedback as additional context
12. On completion: push to existing branch, update Notion to `done`, append iteration
    summary to `Agent output`
13. On failure: update Notion to `failed`, append failure reason to `Agent output`
14. Clean up worktree

## Restart stage inference rules

Lead reads the full `Feedback` field and applies these rules in order:

- **Restart from Architect** if feedback mentions:
  schema design, wrong data model, missing relations, architectural decisions,
  fundamental approach is wrong, needs redesign
- **Restart from Implementer** if feedback mentions:
  wrong logic, missing endpoints, incorrect behaviour, missing feature, wrong response
  shape, business logic issues — this is the safe default for ambiguous feedback
- **Restart from Linter** if feedback mentions:
  naming conventions, code style, formatting, import organisation
- **Restart from QA** if feedback mentions:
  missing tests, wrong assertions, test coverage, edge cases not tested

Always write the inferred stage and a one-line reason to `Agent output` before
proceeding so the human can verify the decision was correct.

## Linter restart behaviour

"Restart from Linter" does not dispatch the Linter agent directly. Instead, follow
the same auto-lint step used in the main pipeline:

1. Run `yarn lint && yarn format && yarn lint` in the worktree
2. If exit code is 0: write synthetic `linter-output.json` with `"mode": "auto"`,
   proceed to QA
3. If exit code is non-zero: capture `lint_errors`, dispatch the Linter agent with
   `files_changed` and `lint_errors` only — no spec or architect context

## Passing feedback to agents

Append feedback as an additional field in the task object passed to each agent:

```json
{
  "spec": { ... },
  "feedback": {
    "iteration": 2,
    "content": "full text of the relevant feedback section",
    "restart_stage": "implementer",
    "reasoning": "feedback describes incorrect business logic in auth service"
  },
  "architect_output": { ... },
  "implementer_output": { ... }
}
```

Only pass previous agent outputs that are still valid given the restart stage, and
apply the same context scoping as the main pipeline (see lead.md scoping table):

- If restarting from Architect: no previous outputs
- If restarting from Implementer: scoped `architect_output` fields only
- If restarting from Linter: auto-lint step first (no agent context needed)
- If restarting from QA: scoped `architect_output` and `implementer_output` fields,
  plus `linter_output`

## Notion feedback format

Human writes feedback in this format — each iteration appended, never overwritten:

```
[YYYY-MM-DD] Iteration N feedback:
- specific issue 1
- specific issue 2
```

## Rules

- Never overwrite previous feedback in Notion — always append
- Never close the existing PR — push fixes to the same branch
- Always confirm inferred restart stage before running
- Always increment `Iteration` before running
- Always clean up worktree on completion or failure
- If FORGE_DRY_RUN is true, skip Notion writes and git pushes, log actions only
