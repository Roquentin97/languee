package com.example.langueedroid.domain

data class AnkiDroidExport(
    val id: String,
    val cardId: String,
    val status: AnkiExportStatus,
    val ankiNoteId: Long?,
    val ankiDeckId: Long?,
    val ankiModelId: Long?,
    val templateVersion: String?,
)
