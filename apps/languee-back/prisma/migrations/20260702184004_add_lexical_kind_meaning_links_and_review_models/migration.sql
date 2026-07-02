-- CreateEnum
CREATE TYPE "LexicalKind" AS ENUM ('word', 'phrasal_verb', 'expression');

-- CreateEnum
CREATE TYPE "MeaningLinkType" AS ENUM ('synonym', 'related');

-- CreateEnum
CREATE TYPE "MeaningLinkSource" AS ENUM ('user', 'provider');

-- CreateEnum
CREATE TYPE "ReviewCardState" AS ENUM ('new', 'learning', 'review');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "ReviewAnswerResult" AS ENUM ('correct', 'close_synonym', 'incorrect', 'revealed');

-- AlterTable
ALTER TABLE "words" ADD COLUMN     "kind" "LexicalKind" NOT NULL DEFAULT 'word';

-- CreateTable
CREATE TABLE "meaning_links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "definition_a_id" UUID NOT NULL,
    "definition_b_id" UUID NOT NULL,
    "relation_type" "MeaningLinkType" NOT NULL,
    "source" "MeaningLinkSource" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meaning_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_review_states" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "state" "ReviewCardState" NOT NULL DEFAULT 'new',
    "due_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interval_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
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
    "previous_interval_days" DOUBLE PRECISION NOT NULL,
    "new_interval_days" DOUBLE PRECISION NOT NULL,
    "ease_factor_after" DOUBLE PRECISION NOT NULL,
    "due_at_after" TIMESTAMPTZ NOT NULL,
    "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meaning_links_definition_a_id_idx" ON "meaning_links"("definition_a_id");

-- CreateIndex
CREATE INDEX "meaning_links_definition_b_id_idx" ON "meaning_links"("definition_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "meaning_links_definition_a_id_definition_b_id_relation_type_key" ON "meaning_links"("definition_a_id", "definition_b_id", "relation_type");

-- CreateIndex
CREATE UNIQUE INDEX "card_review_states_card_id_key" ON "card_review_states"("card_id");

-- CreateIndex
CREATE INDEX "card_review_states_due_at_idx" ON "card_review_states"("due_at");

-- CreateIndex
CREATE INDEX "review_logs_card_id_reviewed_at_idx" ON "review_logs"("card_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "meaning_links" ADD CONSTRAINT "meaning_links_definition_a_id_fkey" FOREIGN KEY ("definition_a_id") REFERENCES "definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaning_links" ADD CONSTRAINT "meaning_links_definition_b_id_fkey" FOREIGN KEY ("definition_b_id") REFERENCES "definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_review_states" ADD CONSTRAINT "card_review_states_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
