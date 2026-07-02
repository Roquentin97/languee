Opus Architect is the planning gate: resolve contracts and ambiguities before code, then hand off an exact plan and stop.

## Applies To

Claude Opus 4.8 running `.claude/agents/architect.md`.

## Lesson

Use Opus for architectural judgment: target-service ownership, cross-service contracts,
persistence design, edge cases, and ambiguity detection. Architect should inspect the
spec, context chain, generated target-service instructions, source contracts, and
available Swagger docs before producing a plan.

If the spec requires an unstated service contract, request shape, response shape,
business rule, timeout behavior, error mapping, persistence field, or ownership
decision, stop with `pending_more_info`. Do not provide an implementation plan while a
blocking question remains.

When the design is ready, produce an explicit step-by-step plan that leaves no design
decision to the Implementer. Do not write code or modify files.

## Why It Matters

Keeping Opus as the design gate prevents Fable from using implementation momentum to
paper over missing product or architecture decisions.
