-- CreateTable
CREATE TABLE "words" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "lemma" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "ipa" TEXT,
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "words_lemma_language_idx" ON "words"("lemma", "language");

-- CreateIndex
CREATE UNIQUE INDEX "words_lemma_language_key" ON "words"("lemma", "language");

-- CreateIndex
CREATE INDEX "definitions_word_id_idx" ON "definitions"("word_id");

-- CreateIndex
CREATE UNIQUE INDEX "definitions_word_id_part_of_speech_definition_key" ON "definitions"("word_id", "part_of_speech", "definition");

-- AddForeignKey
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
