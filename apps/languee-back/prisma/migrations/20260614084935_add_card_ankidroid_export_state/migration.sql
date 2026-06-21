-- CreateEnum
CREATE TYPE "CardAnkiDroidExportStatus" AS ENUM ('pending', 'completed', 'failed');

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

-- CreateIndex
CREATE UNIQUE INDEX "card_ankidroid_exports_card_id_key" ON "card_ankidroid_exports"("card_id");

-- CreateIndex
CREATE INDEX "card_ankidroid_exports_status_idx" ON "card_ankidroid_exports"("status");

-- CreateIndex
CREATE INDEX "card_ankidroid_exports_card_id_idx" ON "card_ankidroid_exports"("card_id");

-- CreateIndex
CREATE INDEX "card_ankidroid_export_attempts_export_id_idx" ON "card_ankidroid_export_attempts"("export_id");

-- AddForeignKey
ALTER TABLE "card_ankidroid_exports" ADD CONSTRAINT "card_ankidroid_exports_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_ankidroid_export_attempts" ADD CONSTRAINT "card_ankidroid_export_attempts_export_id_fkey" FOREIGN KEY ("export_id") REFERENCES "card_ankidroid_exports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
