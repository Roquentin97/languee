package com.example.langueedroid.feature.offline.presentation

import com.example.langueedroid.core.domain.OfflineEntry

data class OfflineQueueState(
    val entries: List<OfflineEntry> = emptyList(),
    val isOffline: Boolean = true,
    val retrying: Boolean = false,
    val retryFailed: Boolean = false,
)

data class OfflineCardCreationRequest(
    val word: String,
    val context: String?,
    val entryId: String,
    val language: String? = null,
    val lookupContext: String? = null,
    val selectionStart: Int? = null,
    val selectionEnd: Int? = null,
)
