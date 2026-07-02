Fable Implementer performs best when it executes the Architect plan end to end, keeps scope tight, and grounds status in tool evidence.

## Applies To

Claude Fable 5 running `.claude/agents/implementer.md`.

## Lesson

Use Fable for sustained implementation runs where the plan is already settled. Start by
reading the Architect output, generated `agent-instructions.md`, and this memory file.
When the instructions are sufficient, act instead of restating the plan.

Follow the Architect plan in order. Do not add helpers, abstractions, fallbacks,
compatibility shims, validation paths, tests, lint fixes, or cleanup unless the plan
requires them. If the plan leaves a design choice open, return `needs_revision` with the
specific ambiguity instead of choosing.

Before returning, compare changed files against the plan and the current diff. Report
only what the session's tool results prove. If lint or tests were not run because another
stage owns them, say that plainly.

## Why It Matters

Fable can work for a long time without losing context, but higher effort can turn into
extra design or unrequested cleanup unless the role boundary is explicit.
