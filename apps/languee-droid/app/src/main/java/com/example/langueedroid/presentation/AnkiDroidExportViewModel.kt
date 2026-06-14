package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.domain.AnkiExportStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AnkiDroidExportItem(
    val cardId: String,
    val status: AnkiExportStatus,
)

data class AnkiDroidExportRetryUiState(
    val items: List<AnkiDroidExportItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

class AnkiDroidExportViewModel(
    private val exportRepository: AnkiDroidExportRepository,
    private val exportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnkiDroidExportRetryUiState())
    val uiState: StateFlow<AnkiDroidExportRetryUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            exportRepository.getCardsWithPendingExport().fold(
                onSuccess = { cardIds ->
                    val items = cardIds.map { cardId ->
                        AnkiDroidExportItem(cardId = cardId, status = AnkiExportStatus.Pending)
                    }
                    _uiState.update { it.copy(items = items, isLoading = false) }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = error.message ?: "Failed to load exports",
                        )
                    }
                },
            )
        }
    }

    fun retryExport(cardId: String) {
        viewModelScope.launch {
            val setupResult = exportService.checkSetup(prefsStore)
            if (!setupResult.isReady) return@launch

            val prefs = prefsStore.read()
            val deckId = prefs.selectedDeckId ?: return@launch

            val exportRecordResult = exportRepository.createOrGetExportRecord(cardId)
            val exportRecord = exportRecordResult.getOrNull() ?: return@launch

            val fields = AnkiDroidNoteBuilder.buildFields(
                cardId = cardId,
                word = cardId,
                lemma = cardId,
                partOfSpeech = "",
                definition = "",
                context = null,
                example = null,
                inflectionForms = null,
            )

            val noteResult = exportService.exportNote(
                noteTypeName = prefs.noteTypeName,
                deckId = deckId,
                fields = fields,
                cardId = cardId,
            )

            noteResult.fold(
                onSuccess = { noteId ->
                    exportRepository.recordAttemptCompleted(
                        exportId = exportRecord.id,
                        ankiNoteId = noteId,
                        ankiDeckId = deckId,
                        ankiDeckNameSnapshot = prefs.selectedDeckName ?: "",
                        ankiModelId = 0L,
                        ankiModelNameSnapshot = prefs.noteTypeName,
                        templateVersion = NoteTypeTemplates.TEMPLATE_VERSION,
                    )
                    val updatedItems = _uiState.value.items.filter { it.cardId != cardId }
                    _uiState.update { it.copy(items = updatedItems) }
                },
                onFailure = { error ->
                    exportRepository.recordAttemptFailed(
                        exportId = exportRecord.id,
                        failureReason = error.javaClass.simpleName,
                        failureMessage = error.message ?: "",
                    )
                    val updatedItems = _uiState.value.items.map { item ->
                        if (item.cardId == cardId) {
                            item.copy(status = AnkiExportStatus.Failed(error.javaClass.simpleName, error.message ?: ""))
                        } else {
                            item
                        }
                    }
                    _uiState.update { it.copy(items = updatedItems) }
                },
            )
        }
    }

    class Factory(
        private val exportRepository: AnkiDroidExportRepository,
        private val exportService: AnkiDroidExportService,
        private val prefsStore: AnkiDroidPreferencesStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AnkiDroidExportViewModel(
                exportRepository = exportRepository,
                exportService = exportService,
                prefsStore = prefsStore,
            ) as T
    }
}
