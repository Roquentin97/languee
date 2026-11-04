package com.example.langueedroid.core.data

import com.example.langueedroid.core.domain.AnkiDroidExport
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
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
        runCatching {
            val response = ankiDroidExportApi.createOrGetExport(cardId)
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()
                            ?: throw Exception("Empty response body from createOrGetExport")
                    val export = dtoToDomain(body)
                    val created = export.ankiNoteId == null
                    logger.info(
                        "ankidroid.export_record_resolved",
                        mapOf("status" to export.status::class.simpleName.orEmpty(), "created" to created.toString()),
                    )
                    export
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to create or get export record: HTTP ${response.code()}")
            }
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
        runCatching {
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
            when {
                response.isSuccessful -> {
                    logger.info("ankidroid.export_attempt_completed")
                    Unit
                }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to record completed attempt: HTTP ${response.code()}")
            }
        }

    suspend fun recordAttemptFailed(
        exportId: String,
        failureReason: String,
        failureMessage: String,
    ): Result<Unit> =
        runCatching {
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
            when {
                response.isSuccessful -> {
                    logger.info("ankidroid.export_attempt_failed")
                    Unit
                }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to record failed attempt: HTTP ${response.code()}")
            }
        }

    suspend fun getCardsWithPendingExport(): Result<List<String>> =
        runCatching {
            val pendingResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "pending")
            val failedResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "failed")

            val pendingIds =
                when {
                    pendingResponse.isSuccessful -> pendingResponse.body()?.map { it.id } ?: emptyList()
                    pendingResponse.code() == 401 -> throw UnauthorizedException()
                    else -> throw Exception("Failed to get pending exports: HTTP ${pendingResponse.code()}")
                }

            val failedIds =
                when {
                    failedResponse.isSuccessful -> failedResponse.body()?.map { it.id } ?: emptyList()
                    failedResponse.code() == 401 -> throw UnauthorizedException()
                    else -> throw Exception("Failed to get failed exports: HTTP ${failedResponse.code()}")
                }

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
