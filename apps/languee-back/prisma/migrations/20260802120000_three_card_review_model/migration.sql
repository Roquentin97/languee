-- Three-card review model (docs/review-model.md): the card becomes the
-- scheduled unit. Each card now carries its own FSRS state and a `type`
-- (existing / inflection / definition) instead of scheduling living on a
-- separate per-definition row. Decks become pure grouping via the new
-- `card_decks` join table instead of a direct FK on `cards`, so a card
-- belongs to any number of decks but is still reviewed once. Pre-launch
-- database - no data to migrate.

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('existing', 'inflection', 'definition');

-- DropForeignKey
ALTER TABLE "cards" DROP CONSTRAINT "cards_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "definition_review_states" DROP CONSTRAINT "definition_review_states_definition_id_fkey";

-- DropForeignKey
ALTER TABLE "definition_review_states" DROP CONSTRAINT "definition_review_states_user_id_fkey";

-- DropIndex
DROP INDEX "cards_deck_id_definition_id_key";

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "deck_id",
ADD COLUMN     "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "due_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lapses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_reviewed_at" TIMESTAMPTZ,
ADD COLUMN     "learning_steps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "part_of_speech" TEXT,
ADD COLUMN     "reps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduled_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "state" "ReviewCardState" NOT NULL DEFAULT 'new',
ADD COLUMN     "type" "CardType" NOT NULL,
ADD COLUMN     "word_id" UUID,
ALTER COLUMN "definition_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "review_logs" ADD COLUMN     "typed_forms" JSONB;

-- DropTable
DROP TABLE "definition_review_states";

-- CreateTable
CREATE TABLE "card_decks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_decks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_decks_deck_id_idx" ON "card_decks"("deck_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_decks_card_id_deck_id_key" ON "card_decks"("card_id", "deck_id");

-- CreateIndex
CREATE INDEX "cards_user_id_due_at_idx" ON "cards"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "cards_user_id_type_idx" ON "cards"("user_id", "type");

-- CreateIndex
CREATE INDEX "cards_definition_id_idx" ON "cards"("definition_id");

-- CreateIndex
CREATE INDEX "cards_word_id_part_of_speech_idx" ON "cards"("word_id", "part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "cards_user_id_definition_id_type_key" ON "cards"("user_id", "definition_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "cards_user_id_word_id_part_of_speech_type_key" ON "cards"("user_id", "word_id", "part_of_speech", "type");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_decks" ADD CONSTRAINT "card_decks_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_decks" ADD CONSTRAINT "card_decks_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
