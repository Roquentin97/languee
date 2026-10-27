# Wiktionary definition cache repair

Dictionary lookups return cached definitions before asking Wiktionary. Repairing
a cached definition changes the content shown by cards that reference it.

## Review procedure

1. Build a read-only candidate inventory from definition rows whose provider is
   `wiktionary`, including the definition ID, word ID and lemma, part of speech,
   definition text, example, and IDs/counts of cards that reference the row.
2. Compare each candidate against the current provider response and prepare a
   proposed before/after change set. Keep the proposed parent and child senses
   separate, and identify any already-cached child definition that would
   conflict with the unique `(wordId, partOfSpeech, definition)` key.
3. Have a reviewer approve each proposed row-level change. Preserve existing
   definition IDs and edit the text in place only when the row's sense identity
   is unambiguous. Add a missing child row only after checking the unique key.
   Resolve collisions explicitly; do not merge or delete rows automatically.
4. Apply only the approved change set in a transaction, then verify the
   definition IDs, card foreign keys, card scheduling fields, and deck links
   against the inventory captured before the change.

Definition rows are referenced by cards with a restrictive foreign key, and
definition content has a unique key per word and part of speech. A repair must
therefore preserve IDs and associations, leave scheduling state attached to
the same cards, and stop for review on any uniqueness conflict.
