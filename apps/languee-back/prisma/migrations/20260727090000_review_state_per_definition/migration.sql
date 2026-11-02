-- Review scheduling becomes deck-agnostic: state moves from one row per card
-- to one row per (user, definition). Pre-launch database — no data to migrate.

-- DropTable
DROP TABLE "card_review_states";

-- CreateTable
CREATE TABLE "definition_review_states" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
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

    CONSTRAINT "definition_review_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "definition_review_states_user_id_definition_id_key" ON "definition_review_states"("user_id", "definition_id");

-- CreateIndex
CREATE INDEX "definition_review_states_user_id_due_at_idx" ON "definition_review_states"("user_id", "due_at");

-- AddForeignKey
ALTER TABLE "definition_review_states" ADD CONSTRAINT "definition_review_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definition_review_states" ADD CONSTRAINT "definition_review_states_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
