package com.example.langueedroid.feature.offline.presentation

import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.core.domain.SelectionRange

data class OfflineQueueState(
    val entries: List<OfflineEntry> = emptyList(),
    val isOffline: Boolean = true,
)

data class OfflineCardCreationRequest(
    val word: String,
    val context: String?,
    val entryId: String,
    val language: String? = null,
    val lookupContext: String? = null,
    val selectionRanges: List<SelectionRange> = emptyList(),
    val targetRanges: List<SelectionRange> = selectionRanges,
)
