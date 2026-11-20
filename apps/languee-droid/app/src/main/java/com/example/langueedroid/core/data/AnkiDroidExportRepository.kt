package com.example.langueedroid.core.data

import com.example.langueedroid.core.domain.AnkiDroidExport
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.dto.AnkiDroidExportResponseDto
import com.example.langueedroid.core.network.dto.RecordAttemptRequest
import com.example.langueedroid.core.telemetry.Logger

class AnkiDroidExportRepository(
    private val ankiDroidExportApi: AnkiDroidExportApi,
    private val logger: Logger,
) {
    private fun mapStatus(dto: AnkiDroidExportResponseDto): AnkiExportStatus =
        when (dto.status) {
            "completed" -> AnkiExportStatus.Completed
            "failed" ->
                AnkiExportStatus.Failed(
                    reason = dto.failureReason ?: "unknown",
                    message = dto.failureMessage ?: "",
                )
            else -> AnkiExportStatus.Pending
        }

    private fun dtoToDomain(dto: AnkiDroidExportResponseDto): AnkiDroidExport =
        AnkiDroidExport(
            id = dto.id,
            cardId = dto.cardId,
            status = mapStatus(dto),
            ankiNoteId = dto.ankiNoteId?.toLongOrNull(),
            ankiDeckId = dto.ankiDeckId?.toLongOrNull(),
            ankiModelId = dto.ankiModelId?.toLongOrNull(),
            templateVersion = dto.templateVersion,
        )

    suspend fun createOrGetExportRecord(cardId: String): Result<AnkiDroidExport> =
        runCatchingCancellable {
            val response = ankiDroidExportApi.createOrGetExport(cardId)
            response.throwIfUnsuccessful(ApiOperation.EXPORT_CREATE)
            val export = dtoToDomain(response.bodyOrThrow(ApiOperation.EXPORT_CREATE))
            val created = export.ankiNoteId == null
            logger.info(
                "ankidroid.export_record_resolved",
                mapOf("status" to export.status::class.simpleName.orEmpty(), "created" to created.toString()),
            )
            export
        }

    suspend fun recordAttemptCompleted(
        exportId: String,
        ankiNoteId: Long,
        ankiDeckId: Long,
        ankiDeckNameSnapshot: String,
        ankiModelId: Long,
        ankiModelNameSnapshot: String,
        templateVersion: String,
    ): Result<Unit> =
        runCatchingCancellable {
            val response =
                ankiDroidExportApi.recordAttempt(
                    exportId = exportId,
                    body =
                        RecordAttemptRequest(
                            status = "completed",
                            ankiNoteId = ankiNoteId.toString(),
                            ankiDeckId = ankiDeckId.toString(),
                            ankiDeckNameSnapshot = ankiDeckNameSnapshot,
                            ankiModelId = ankiModelId.toString(),
                            ankiModelNameSnapshot = ankiModelNameSnapshot,
                            templateVersion = templateVersion,
                        ),
                )
            response.throwIfUnsuccessful(ApiOperation.EXPORT_RECORD)
            logger.info("ankidroid.export_attempt_completed")
        }

    suspend fun recordAttemptFailed(
        exportId: String,
        failureReason: String,
        failureMessage: String,
    ): Result<Unit> =
        runCatchingCancellable {
            val response =
                ankiDroidExportApi.recordAttempt(
                    exportId = exportId,
                    body =
                        RecordAttemptRequest(
                            status = "failed",
                            failureReason = failureReason,
                            failureMessage = failureMessage,
                        ),
                )
            response.throwIfUnsuccessful(ApiOperation.EXPORT_RECORD)
            logger.info("ankidroid.export_attempt_failed")
        }

    suspend fun getCardsWithPendingExport(): Result<List<String>> =
        runCatchingCancellable {
            val pendingResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "pending")
            val failedResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "failed")

            pendingResponse.throwIfUnsuccessful(ApiOperation.EXPORT_STATUS_LIST)
            failedResponse.throwIfUnsuccessful(ApiOperation.EXPORT_STATUS_LIST)
            val pendingIds = pendingResponse.body().orEmpty().map { it.id }
            val failedIds = failedResponse.body().orEmpty().map { it.id }

            val result = (pendingIds + failedIds).distinct()
            logger.debug(
                "ankidroid.pending_exports",
                mapOf(
                    "pending_count" to pendingIds.size.toString(),
                    "failed_count" to failedIds.size.toString(),
                    "total_count" to result.size.toString(),
                ),
            )
            result
        }
}
