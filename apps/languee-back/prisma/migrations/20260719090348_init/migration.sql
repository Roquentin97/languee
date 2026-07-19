-- CreateEnum
CREATE TYPE "LexicalKind" AS ENUM ('word', 'phrasal_verb', 'expression');

-- CreateEnum
CREATE TYPE "CardAnkiDroidExportStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ReviewCardState" AS ENUM ('new', 'learning', 'review', 'relearning');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "ReviewAnswerResult" AS ENUM ('correct', 'incorrect', 'revealed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "words" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "lemma" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "ipa" TEXT,
    "kind" "LexicalKind" NOT NULL DEFAULT 'word',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "definitions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "word_id" UUID NOT NULL,
    "part_of_speech" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "provider" TEXT NOT NULL,
    "gap_fill_metadata" JSONB,
    "has_irregular_forms" BOOLEAN NOT NULL DEFAULT false,
    "inflection_forms" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "deck_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "context" TEXT,
    "inflection_forms" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_ankidroid_exports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "status" "CardAnkiDroidExportStatus" NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "failure_message" TEXT,
    "anki_note_id" TEXT,
    "anki_deck_id" TEXT,
    "anki_deck_name_snapshot" TEXT,
    "anki_model_id" TEXT,
    "anki_model_name_snapshot" TEXT,
    "template_version" TEXT,
    "last_attempted_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_ankidroid_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_ankidroid_export_attempts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "export_id" UUID NOT NULL,
    "status" "CardAnkiDroidExportStatus" NOT NULL,
    "failure_reason" TEXT,
    "failure_message" TEXT,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_ankidroid_export_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_review_states" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "state" "ReviewCardState" NOT NULL DEFAULT 'new',
    "due_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_review_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "rating" "ReviewRating" NOT NULL,
    "typed_answer" TEXT,
    "answer_result" "ReviewAnswerResult",
    "state_before" "ReviewCardState" NOT NULL,
    "previous_interval_days" INTEGER NOT NULL,
    "new_interval_days" INTEGER NOT NULL,
    "stability_after" DOUBLE PRECISION NOT NULL,
    "difficulty_after" DOUBLE PRECISION NOT NULL,
    "due_at_after" TIMESTAMPTZ NOT NULL,
    "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "words_lemma_language_idx" ON "words"("lemma", "language");

-- CreateIndex
CREATE UNIQUE INDEX "words_lemma_language_key" ON "words"("lemma", "language");

-- CreateIndex
CREATE INDEX "definitions_word_id_idx" ON "definitions"("word_id");

-- CreateIndex
CREATE INDEX "definitions_part_of_speech_idx" ON "definitions"("part_of_speech");

-- CreateIndex
CREATE INDEX "definitions_part_of_speech_has_irregular_forms_idx" ON "definitions"("part_of_speech", "has_irregular_forms");

-- CreateIndex
CREATE UNIQUE INDEX "definitions_word_id_part_of_speech_definition_key" ON "definitions"("word_id", "part_of_speech", "definition");

-- CreateIndex
CREATE UNIQUE INDEX "decks_user_id_name_key" ON "decks"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cards_deck_id_definition_id_key" ON "cards"("deck_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_ankidroid_exports_card_id_key" ON "card_ankidroid_exports"("card_id");

-- CreateIndex
CREATE INDEX "card_ankidroid_exports_status_idx" ON "card_ankidroid_exports"("status");

-- CreateIndex
CREATE INDEX "card_ankidroid_exports_card_id_idx" ON "card_ankidroid_exports"("card_id");

-- CreateIndex
CREATE INDEX "card_ankidroid_export_attempts_export_id_idx" ON "card_ankidroid_export_attempts"("export_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_review_states_card_id_key" ON "card_review_states"("card_id");

-- CreateIndex
CREATE INDEX "card_review_states_due_at_idx" ON "card_review_states"("due_at");

-- CreateIndex
CREATE INDEX "review_logs_card_id_reviewed_at_idx" ON "review_logs"("card_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_ankidroid_exports" ADD CONSTRAINT "card_ankidroid_exports_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_ankidroid_export_attempts" ADD CONSTRAINT "card_ankidroid_export_attempts_export_id_fkey" FOREIGN KEY ("export_id") REFERENCES "card_ankidroid_exports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_review_states" ADD CONSTRAINT "card_review_states_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
