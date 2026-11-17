ALTER TYPE "LexicalKind" RENAME TO "LexicalEntryKind";
ALTER TYPE "LexicalEntryKind" ADD VALUE 'idiom';

ALTER TABLE "words" RENAME TO "lexical_entries";
ALTER TABLE "lexical_entries" RENAME CONSTRAINT "words_pkey" TO "lexical_entries_pkey";
ALTER TABLE "definitions" RENAME COLUMN "word_id" TO "entry_id";
ALTER TABLE "cards" RENAME COLUMN "word_id" TO "entry_id";
ALTER TABLE "eval_lexical_lookups" RENAME COLUMN "preferred_word_id" TO "preferred_entry_id";
ALTER TABLE "eval_lexical_learner_choices" RENAME COLUMN "chosen_word_id" TO "chosen_entry_id";
ALTER TABLE "word_forms" RENAME TO "lexical_forms";
ALTER TABLE "lexical_forms" RENAME CONSTRAINT "word_forms_pkey" TO "lexical_forms_pkey";
ALTER TABLE "lexical_forms" RENAME COLUMN "word_id" TO "entry_id";

ALTER INDEX "words_lemma_language_key" RENAME TO "lexical_entries_lemma_language_key";
ALTER INDEX "words_lemma_language_idx" RENAME TO "lexical_entries_lemma_language_idx";
ALTER INDEX "definitions_word_id_part_of_speech_definition_key" RENAME TO "definitions_entry_id_part_of_speech_definition_key";
ALTER INDEX "definitions_word_id_idx" RENAME TO "definitions_entry_id_idx";
ALTER INDEX "cards_user_id_word_id_part_of_speech_type_key" RENAME TO "cards_user_id_entry_id_part_of_speech_type_key";
ALTER INDEX "cards_word_id_part_of_speech_idx" RENAME TO "cards_entry_id_part_of_speech_idx";
ALTER INDEX "word_forms_word_id_form_part_of_speech_relation_type_key" RENAME TO "lexical_forms_entry_id_form_part_of_speech_relation_type_key";
ALTER INDEX "word_forms_form_idx" RENAME TO "lexical_forms_form_idx";

ALTER TABLE "definitions" RENAME CONSTRAINT "definitions_word_id_fkey" TO "definitions_entry_id_fkey";
ALTER TABLE "cards" RENAME CONSTRAINT "cards_word_id_fkey" TO "cards_entry_id_fkey";
ALTER TABLE "lexical_forms" RENAME CONSTRAINT "word_forms_word_id_fkey" TO "lexical_forms_entry_id_fkey";

ALTER TABLE "eval_lexical_lookups" DROP CONSTRAINT "eval_lookup_preferred_in_candidates";
UPDATE "eval_lexical_lookups"
SET candidates = (
  SELECT COALESCE(jsonb_agg((candidate - 'wordId') || jsonb_build_object('entryId', candidate->'wordId')), '[]'::jsonb)
  FROM jsonb_array_elements(candidates) AS candidate
);
ALTER TABLE "eval_lexical_lookups" ADD CONSTRAINT "eval_lookup_preferred_in_candidates"
CHECK ("preferred_entry_id" IS NULL OR candidates @> jsonb_build_array(jsonb_build_object('entryId', "preferred_entry_id"::text, 'partOfSpeech', "preferred_pos")));
