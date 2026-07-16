-- CreateEnum
CREATE TYPE "LexicalKind" AS ENUM ('word', 'phrasal_verb', 'expression');

-- CreateEnum
CREATE TYPE "ReviewCardState" AS ENUM ('new', 'learning', 'review', 'relearning');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('again', 'hard', 'good', 'easy');

-- CreateEnum
CREATE TYPE "ReviewAnswerResult" AS ENUM ('correct', 'incorrect', 'revealed');

-- AlterTable
ALTER TABLE "words" ADD COLUMN     "kind" "LexicalKind" NOT NULL DEFAULT 'word';

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
CREATE UNIQUE INDEX "card_review_states_card_id_key" ON "card_review_states"("card_id");

-- CreateIndex
CREATE INDEX "card_review_states_due_at_idx" ON "card_review_states"("due_at");

-- CreateIndex
CREATE INDEX "review_logs_card_id_reviewed_at_idx" ON "review_logs"("card_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "card_review_states" ADD CONSTRAINT "card_review_states_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
