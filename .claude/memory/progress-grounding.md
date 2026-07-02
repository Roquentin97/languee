Progress updates and final summaries must be backed by tool results from the current session.

## Applies To

All Forge agents, especially Claude Fable 5 on long-running implementation work.

## Lesson

Before saying work is complete, audited, validated, linted, tested, migrated, pushed, or
reviewed, point the claim back to a tool result from this session. If the evidence is not
available, report the limitation directly.

For JSON handoffs, keep `notes` factual: files changed, commands run, commands skipped
because another stage owns them, and blockers. Do not imply downstream stages passed
before they actually run.

For human-facing summaries, lead with the outcome and then include only details that
change what the reader should do next.

## Why It Matters

Long autonomous runs are useful only when status reports stay tied to observable
results. Grounding progress prevents fabricated completion claims and makes retries
localized.
