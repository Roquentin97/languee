# Project instructions

Read `CLAUDE.md` for project conventions and applicable workflows.

When a change raises a backward-compatibility or existing-data concern, flag it
in the conversation and ask whether compatibility must be preserved or test
data can be recreated from scratch. Do not assume either choice or implement a
compatibility layer, migration, or data wipe before the answer.

Write comments and documentation for readers of the current code, not as a
retrospective of the change. Do not add change history, redundant narration,
or explanations that merely restate clear code or duplicate nearby docs. Keep
non-obvious constraints, invariants, reasons, useful public behavior, and
operational procedures. Review new and modified comments and docs for relevance
and concision before finishing.
