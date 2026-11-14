package com.example.langueedroid.core.domain

data class OfflineEntry(
    val id: String,
    val word: String,
    val context: String?,
    val capturedAt: Long,
    val language: String? = null,
    val lookupContext: String? = null,
    val selectionStart: Int? = null,
    val selectionEnd: Int? = null,
    val pendingDefinitionId: String? = null,
    val pendingLookupId: String? = null,
    val pendingDeckId: String? = null,
    val pendingInflectionForms: String? = null,
)
