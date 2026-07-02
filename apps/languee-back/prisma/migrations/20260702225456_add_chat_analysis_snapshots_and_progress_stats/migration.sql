-- CreateTable
CREATE TABLE "chat_analysis_snapshots" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "conversation_id" UUID NOT NULL,
    "user_message_count" INTEGER NOT NULL,
    "fingerprints" JSONB NOT NULL,
    "counts_by_type" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_analysis_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_progress_stats" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "raised" INTEGER NOT NULL,
    "resolved" INTEGER NOT NULL,
    "resolved_by_type" JSONB NOT NULL,
    "raised_by_type" JSONB NOT NULL,
    "user_messages" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chat_progress_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_analysis_snapshots_conversation_id_created_at_idx" ON "chat_analysis_snapshots"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_progress_stats_user_id_week_start_key" ON "chat_progress_stats"("user_id", "week_start");

-- AddForeignKey
ALTER TABLE "chat_analysis_snapshots" ADD CONSTRAINT "chat_analysis_snapshots_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_progress_stats" ADD CONSTRAINT "chat_progress_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
