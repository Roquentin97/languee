ALTER TABLE "cards"
ADD COLUMN "target_ranges" JSONB;

ALTER TABLE "eval_lexical_lookups"
ADD COLUMN "selection_ranges" JSONB;

UPDATE "eval_lexical_lookups"
SET "selection_ranges" = jsonb_build_array(
  jsonb_build_object('start', "selection_start", 'end', "selection_end")
)
WHERE "selection_start" IS NOT NULL AND "selection_end" IS NOT NULL;

ALTER TABLE "eval_lexical_lookups"
DROP COLUMN "selection_start",
DROP COLUMN "selection_end";

CREATE INDEX "lexical_entries_language_lemma_prefix_idx"
ON "lexical_entries" ("language", "lemma" text_pattern_ops);
