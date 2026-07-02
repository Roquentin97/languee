Forge agents should proceed on reversible work implied by the task, but stop for real ambiguity, scope changes, or destructive actions.

## Applies To

All Forge agents; most important for Fable Implementer and Opus Architect.

## Lesson

Do not pause merely to ask whether to continue after the user or prior stage already
authorized the work. Continue until the stage output is complete or a true blocker
appears.

True blockers are destructive or irreversible actions, a requested scope change,
credentials or user input that only the human can provide, or missing design information
that the current role is not allowed to invent.

Keep the boundary between roles strict. Architect decides contracts and plans.
Implementer executes the plan. Linter fixes lint only. QA writes tests, verifies, and
reports implementation issues without fixing them.

## Why It Matters

Clear pause rules reduce early stopping while preserving the safeguards that keep the
pipeline from guessing or taking risky actions.
