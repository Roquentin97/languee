package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.dto.AnkiDroidExportResponseDto
import com.example.langueedroid.core.network.dto.RecordAttemptRequest
import com.example.langueedroid.core.domain.AnkiDroidExport
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException

private const val TAG = "AnkiDroidExportRepository"

class AnkiDroidExportRepository(
    private val ankiDroidExportApi: AnkiDroidExportApi,
) {

    private fun mapStatus(dto: AnkiDroidExportResponseDto): AnkiExportStatus =
        when (dto.status) {
            "completed" -> AnkiExportStatus.Completed
            "failed" -> AnkiExportStatus.Failed(
                reason = dto.failureReason ?: "unknown",
                message = dto.failureMessage ?: "",
            )
            else -> AnkiExportStatus.Pending
        }

    private fun dtoToDomain(dto: AnkiDroidExportResponseDto): AnkiDroidExport = AnkiDroidExport(
        id = dto.id,
        cardId = dto.cardId,
        status = mapStatus(dto),
        ankiNoteId = dto.ankiNoteId?.toLongOrNull(),
        ankiDeckId = dto.ankiDeckId?.toLongOrNull(),
        ankiModelId = dto.ankiModelId?.toLongOrNull(),
        templateVersion = dto.templateVersion,
    )

    suspend fun createOrGetExportRecord(cardId: String): Result<AnkiDroidExport> = runCatching {
        val response = ankiDroidExportApi.createOrGetExport(cardId)
        when {
            response.isSuccessful -> {
                val body = response.body()
                    ?: throw Exception("Empty response body from createOrGetExport")
                val export = dtoToDomain(body)
                val created = export.ankiNoteId == null
                Log.i(TAG, "[event=ankidroid.export_record_resolved method=createOrGetExportRecord] export record resolved | exportId=${export.id} status=${export.status} created=$created")
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
    ): Result<Unit> = runCatching {
        val response = ankiDroidExportApi.recordAttempt(
            exportId = exportId,
            body = RecordAttemptRequest(
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
                Log.i(TAG, "[event=ankidroid.export_attempt_completed method=recordAttemptCompleted] export attempt recorded as completed | exportId=$exportId ankiNoteId=$ankiNoteId")
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
    ): Result<Unit> = runCatching {
        val response = ankiDroidExportApi.recordAttempt(
            exportId = exportId,
            body = RecordAttemptRequest(
                status = "failed",
                failureReason = failureReason,
                failureMessage = failureMessage,
            ),
        )
        when {
            response.isSuccessful -> {
                Log.i(TAG, "[event=ankidroid.export_attempt_failed method=recordAttemptFailed] export attempt recorded as failed | exportId=$exportId failureReason=$failureReason")
                Unit
            }
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to record failed attempt: HTTP ${response.code()}")
        }
    }

    suspend fun getCardsWithPendingExport(): Result<List<String>> = runCatching {
        val pendingResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "pending")
        val failedResponse = ankiDroidExportApi.getCardsWithExportStatus(status = "failed")

        val pendingIds = when {
            pendingResponse.isSuccessful -> pendingResponse.body()?.map { it.id } ?: emptyList()
            pendingResponse.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to get pending exports: HTTP ${pendingResponse.code()}")
        }

        val failedIds = when {
            failedResponse.isSuccessful -> failedResponse.body()?.map { it.id } ?: emptyList()
            failedResponse.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to get failed exports: HTTP ${failedResponse.code()}")
        }

        val result = (pendingIds + failedIds).distinct()
        Log.d(TAG, "[event=ankidroid.pending_exports method=getCardsWithPendingExport] pending export cards | pendingCount=${pendingIds.size} failedCount=${failedIds.size} totalMerged=${result.size}")
        result
    }
}
