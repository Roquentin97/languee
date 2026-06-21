package com.example.langueedroid.core.network.dto

data class AnkiDroidExportResponseDto(
    val id: String,
    val cardId: String,
    val status: String,
    val ankiNoteId: String?,
    val ankiDeckId: String?,
    val ankiDeckNameSnapshot: String?,
    val ankiModelId: String?,
    val ankiModelNameSnapshot: String?,
    val templateVersion: String?,
    val failureReason: String?,
    val failureMessage: String?,
)

data class RecordAttemptRequest(
    val status: String,
    val failureReason: String? = null,
    val failureMessage: String? = null,
    val ankiNoteId: String? = null,
    val ankiDeckId: String? = null,
    val ankiDeckNameSnapshot: String? = null,
    val ankiModelId: String? = null,
    val ankiModelNameSnapshot: String? = null,
    val templateVersion: String? = null,
)

data class CardSummaryDto(
    val id: String,
    val ankiDroidExportStatus: String?,
)
