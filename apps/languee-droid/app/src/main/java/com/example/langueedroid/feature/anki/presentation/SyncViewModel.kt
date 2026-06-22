package com.example.langueedroid.feature.anki.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class SyncUiState {
    object Idle : SyncUiState()
    object Syncing : SyncUiState()
    data class Result(val syncedCount: Int, val failedWords: List<String>) : SyncUiState()
}

@HiltViewModel
class SyncViewModel @Inject constructor(
    private val exportRepository: AnkiDroidExportRepository,
    private val exportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
    private val cardRepository: CardRepository,
    private val deckRepository: DeckRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<SyncUiState>(SyncUiState.Idle)
    val uiState: StateFlow<SyncUiState> = _uiState.asStateFlow()

    private var syncJob: Job? = null

    fun sync() {
        if (syncJob?.isActive == true) return

        syncJob = viewModelScope.launch {
            _uiState.value = SyncUiState.Syncing

            val cardIds = exportRepository.getCardsWithPendingExport().getOrElse {
                _uiState.value = SyncUiState.Result(syncedCount = 0, failedWords = emptyList())
                return@launch
            }
            if (cardIds.isEmpty()) {
                _uiState.value = SyncUiState.Result(syncedCount = 0, failedWords = emptyList())
                return@launch
            }

            val setupResult = exportService.checkSetup(prefsStore)
            if (!setupResult.isReady) {
                _uiState.value = SyncUiState.Result(syncedCount = 0, failedWords = cardIds)
                return@launch
            }

            val prefs = prefsStore.read()
            val deckNamesById = deckRepository.getDecks().getOrDefault(emptyList())
                .associate { it.id to it.name }

            var syncedCount = 0
            val failedWords = mutableListOf<String>()

            for (cardId in cardIds) {
                val card = cardRepository.getCard(cardId).getOrNull()
                if (card == null) {
                    failedWords.add(cardId)
                    continue
                }

                val deckName = deckNamesById[card.deckId]
                if (deckName == null) {
                    failedWords.add(card.lemma)
                    continue
                }

                val exportRecord = exportRepository.createOrGetExportRecord(cardId).getOrNull()
                if (exportRecord == null) {
                    failedWords.add(card.lemma)
                    continue
                }

                val fields = AnkiDroidNoteBuilder.buildFields(
                    cardId = cardId,
                    word = card.lemma,
                    lemma = card.lemma,
                    partOfSpeech = card.partOfSpeech,
                    definition = card.definition,
                    context = card.context,
                    example = card.example,
                    inflectionForms = card.inflectionForms,
                )

                val noteResult = exportService.exportNote(
                    noteTypeName = prefs.noteTypeName,
                    deckName = deckName,
                    fields = fields,
                    cardId = cardId,
                )

                noteResult.fold(
                    onSuccess = { result ->
                        exportRepository.recordAttemptCompleted(
                            exportId = exportRecord.id,
                            ankiNoteId = result.noteId,
                            ankiDeckId = result.deckId,
                            ankiDeckNameSnapshot = deckName,
                            ankiModelId = result.modelId,
                            ankiModelNameSnapshot = prefs.noteTypeName,
                            templateVersion = NoteTypeTemplates.TEMPLATE_VERSION,
                        )
                        syncedCount++
                    },
                    onFailure = { error ->
                        exportRepository.recordAttemptFailed(
                            exportId = exportRecord.id,
                            failureReason = error.javaClass.simpleName,
                            failureMessage = error.message ?: "",
                        )
                        failedWords.add(card.lemma)
                    },
                )
            }

            _uiState.value = SyncUiState.Result(syncedCount = syncedCount, failedWords = failedWords)
        }
    }

    fun dismissResult() {
        _uiState.value = SyncUiState.Idle
    }

}
