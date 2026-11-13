package com.example.langueedroid.feature.offline.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.domain.OfflineEntry
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OfflineQueueViewModel
    @Inject
    constructor(
        private val offlineQueueRepository: OfflineQueueRepository,
        private val offlineStateManager: OfflineStateManager,
        private val cardRepository: CardRepository,
    ) : ViewModel() {
        private val retrying = MutableStateFlow(false)
        private val retryFailed = MutableStateFlow(false)
        val state: StateFlow<OfflineQueueState> =
            combine(
                offlineQueueRepository.getAll(),
                offlineStateManager.isOffline,
                retrying,
                retryFailed,
            ) { entries, isOffline, busy, failed ->
                OfflineQueueState(entries = entries, isOffline = isOffline, retrying = busy, retryFailed = failed)
            }.stateIn(viewModelScope, SharingStarted.Eagerly, OfflineQueueState())

        private val _navigateToCardCreation = MutableSharedFlow<OfflineCardCreationRequest>(extraBufferCapacity = 1)
        val navigateToCardCreation: SharedFlow<OfflineCardCreationRequest> = _navigateToCardCreation.asSharedFlow()

        fun onEntrySelected(entry: OfflineEntry) {
            if (state.value.isOffline || retrying.value) return
            if (entry.pendingDefinitionId != null && entry.pendingDeckId != null) {
                retryPending(entry)
                return
            }
            _navigateToCardCreation.tryEmit(
                OfflineCardCreationRequest(
                    word = entry.word,
                    context = entry.context,
                    entryId = entry.id,
                    language = entry.language,
                    lookupContext = entry.lookupContext,
                    selectionStart = entry.selectionStart,
                    selectionEnd = entry.selectionEnd,
                ),
            )
        }

        private fun retryPending(entry: OfflineEntry) {
            retrying.value = true
            retryFailed.value = false
            viewModelScope.launch {
                try {
                    val forms: Map<String, String>? =
                        entry.pendingInflectionForms?.let {
                            Gson().fromJson(it, object : TypeToken<Map<String, String>>() {}.type)
                        }
                    val result =
                        cardRepository.createCard(
                            deckId = requireNotNull(entry.pendingDeckId),
                            definitionId = requireNotNull(entry.pendingDefinitionId),
                            context = entry.context,
                            inflectionForms = forms,
                            lookupId = entry.pendingLookupId,
                        )
                    if (result.isSuccess) offlineQueueRepository.remove(entry.id) else retryFailed.value = true
                } catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException) throw error
                    retryFailed.value = true
                } finally {
                    retrying.value = false
                }
            }
        }

        fun onStartReviewing() {
            val first = state.value.entries.firstOrNull() ?: return
            onEntrySelected(first)
        }
    }
