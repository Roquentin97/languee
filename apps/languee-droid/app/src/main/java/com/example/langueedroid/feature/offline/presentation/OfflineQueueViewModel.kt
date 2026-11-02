package com.example.langueedroid.feature.offline.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.domain.OfflineEntry
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class OfflineQueueViewModel
    @Inject
    constructor(
        private val offlineQueueRepository: OfflineQueueRepository,
        private val offlineStateManager: OfflineStateManager,
    ) : ViewModel() {
        val state: StateFlow<OfflineQueueState> =
            combine(
                offlineQueueRepository.getAll(),
                offlineStateManager.isOffline,
            ) { entries, isOffline ->
                OfflineQueueState(entries = entries, isOffline = isOffline)
            }.stateIn(viewModelScope, SharingStarted.Eagerly, OfflineQueueState())

        private val _navigateToCardCreation = MutableSharedFlow<OfflineCardCreationRequest>(extraBufferCapacity = 1)
        val navigateToCardCreation: SharedFlow<OfflineCardCreationRequest> = _navigateToCardCreation.asSharedFlow()

        fun onEntrySelected(entry: OfflineEntry) {
            if (state.value.isOffline) return
            _navigateToCardCreation.tryEmit(
                OfflineCardCreationRequest(
                    word = entry.word,
                    context = entry.context,
                    entryId = entry.id,
                ),
            )
        }

        fun onStartReviewing() {
            val first = state.value.entries.firstOrNull() ?: return
            onEntrySelected(first)
        }
    }
