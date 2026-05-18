-- AlterTable
ALTER TABLE "definitions" ADD COLUMN     "has_irregular_forms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inflection_forms" JSONB;

-- CreateIndex
CREATE INDEX "definitions_part_of_speech_idx" ON "definitions"("part_of_speech");

-- CreateIndex
CREATE INDEX "definitions_part_of_speech_has_irregular_forms_idx" ON "definitions"("part_of_speech", "has_irregular_forms");
