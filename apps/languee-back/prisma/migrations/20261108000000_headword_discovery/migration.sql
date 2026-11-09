CREATE TABLE "word_forms" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "word_id" UUID NOT NULL,
  "form" TEXT NOT NULL,
  "part_of_speech" TEXT NOT NULL,
  "relation_type" TEXT NOT NULL,
  CONSTRAINT "word_forms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "word_forms_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "word_forms_word_id_form_part_of_speech_relation_type_key" ON "word_forms"("word_id", "form", "part_of_speech", "relation_type");
CREATE INDEX "word_forms_form_idx" ON "word_forms"("form");
CREATE TABLE "lookup_states" (
  "term" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "dictionary_fetched_at" TIMESTAMPTZ,
  "discovery_completed_at" TIMESTAMPTZ,
  CONSTRAINT "lookup_states_pkey" PRIMARY KEY ("term", "language")
);
DROP INDEX "definitions_part_of_speech_has_irregular_forms_idx";
ALTER TABLE "definitions" DROP COLUMN "inflection_forms", DROP COLUMN "has_irregular_forms";
