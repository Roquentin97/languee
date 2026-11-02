package com.example.langueedroid.feature.offline.presentation

import com.example.langueedroid.core.domain.OfflineEntry

data class OfflineQueueState(
    val entries: List<OfflineEntry> = emptyList(),
    val isOffline: Boolean = true,
)

data class OfflineCardCreationRequest(
    val word: String,
    val context: String?,
    val entryId: String,
)
