package com.example.langueedroid.feature.anki.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.remoteFailureKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class SyncUiState {
    object Idle : SyncUiState()

    object Syncing : SyncUiState()

    data class Result(
        val syncedCount: Int,
        val failedWords: List<String>,
    ) : SyncUiState()

    data class Failure(
        val failureKind: RemoteFailureKind,
    ) : SyncUiState()

    object SetupRequired : SyncUiState()
}

private sealed class SyncCardOutcome {
    object Succeeded : SyncCardOutcome()

    data class Failed(
        val word: String,
    ) : SyncCardOutcome()

    object Unauthorized : SyncCardOutcome()
}

@HiltViewModel
class SyncViewModel
    @Inject
    constructor(
        private val exportRepository: AnkiDroidExportRepository,
        private val exportService: AnkiDroidExportService,
        private val prefsStore: AnkiDroidPreferencesStore,
        private val cardRepository: CardRepository,
        private val deckRepository: DeckRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow<SyncUiState>(SyncUiState.Idle)
        val uiState: StateFlow<SyncUiState> = _uiState.asStateFlow()

        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

        private var syncJob: Job? = null

        fun sync() {
            if (syncJob?.isActive == true) return

            syncJob =
                viewModelScope.launch {
                    _uiState.value = SyncUiState.Syncing

                    val pendingResult = exportRepository.getCardsWithPendingExport()
                    val cardIds =
                        pendingResult.getOrElse { error ->
                            reportFailure(error)
                            return@launch
                        }
                    if (cardIds.isEmpty()) {
                        _uiState.value = SyncUiState.Result(syncedCount = 0, failedWords = emptyList())
                        return@launch
                    }

                    val setupResult = exportService.checkSetup(prefsStore)
                    if (!setupResult.isReady) {
                        _uiState.value = SyncUiState.SetupRequired
                        return@launch
                    }

                    val prefs = prefsStore.read()
                    val decksResult = deckRepository.getDecks()
                    val decks =
                        decksResult.getOrElse { error ->
                            reportFailure(error)
                            return@launch
                        }
                    val deckNamesById = decks.associate { it.id to it.name }

                    _uiState.value = syncCards(cardIds, deckNamesById, prefs.noteTypeName)
                }
        }

        private suspend fun syncCards(
            cardIds: List<String>,
            deckNamesById: Map<String, String>,
            noteTypeName: String,
        ): SyncUiState {
            var syncedCount = 0
            val failedWords = mutableListOf<String>()

            for (cardId in cardIds) {
                when (val outcome = syncCard(cardId, deckNamesById, noteTypeName)) {
                    SyncCardOutcome.Succeeded -> syncedCount++
                    is SyncCardOutcome.Failed -> failedWords.add(outcome.word)
                    SyncCardOutcome.Unauthorized -> return SyncUiState.Failure(RemoteFailureKind.UNEXPECTED)
                }
            }

            return SyncUiState.Result(syncedCount = syncedCount, failedWords = failedWords)
        }

        private suspend fun syncCard(
            cardId: String,
            deckNamesById: Map<String, String>,
            noteTypeName: String,
        ): SyncCardOutcome {
            val cardResult = cardRepository.getCard(cardId)
            val card = cardResult.getOrNull() ?: return failureFor(cardResult.exceptionOrNull(), cardId)
            val deckName = deckNamesById[card.deckId] ?: return SyncCardOutcome.Failed(card.lemma)
            val exportRecordResult = exportRepository.createOrGetExportRecord(cardId)
            val exportRecord = exportRecordResult.getOrNull() ?: return failureFor(exportRecordResult.exceptionOrNull(), card.lemma)
            val noteResult =
                exportService.exportNote(
                    noteTypeName = noteTypeName,
                    deckName = deckName,
                    fields = buildFields(cardId, card),
                    cardId = cardId,
                )
            val note = noteResult.getOrNull() ?: return recordExportFailure(exportRecord.id, card.lemma, noteResult.exceptionOrNull())
            val completedResult =
                exportRepository.recordAttemptCompleted(
                    exportId = exportRecord.id,
                    ankiNoteId = note.noteId,
                    ankiDeckId = note.deckId,
                    ankiDeckNameSnapshot = deckName,
                    ankiModelId = note.modelId,
                    ankiModelNameSnapshot = noteTypeName,
                    templateVersion = NoteTypeTemplates.TEMPLATE_VERSION,
                )
            return completedResult.fold(
                onSuccess = { SyncCardOutcome.Succeeded },
                onFailure = { error -> failureFor(error, card.lemma) },
            )
        }

        private suspend fun recordExportFailure(
            exportId: String,
            word: String,
            error: Throwable?,
        ): SyncCardOutcome {
            if (error != null) {
                exportRepository.recordAttemptFailed(
                    exportId = exportId,
                    failureReason = error.javaClass.simpleName,
                    failureMessage = error.message ?: "",
                )
            }
            return failureFor(error, word)
        }

        private fun failureFor(
            error: Throwable?,
            word: String,
        ): SyncCardOutcome =
            if (error is UnauthorizedException) {
                _unauthorizedEvent.tryEmit(Unit)
                SyncCardOutcome.Unauthorized
            } else {
                SyncCardOutcome.Failed(word)
            }

        private fun buildFields(
            cardId: String,
            card: Card,
        ) = AnkiDroidNoteBuilder.buildFields(
            cardId = cardId,
            word = card.lemma,
            lemma = card.lemma,
            partOfSpeech = card.partOfSpeech,
            definition = card.definition,
            context = card.context,
            example = card.example,
            inflectionForms = card.inflectionForms,
        )

        fun dismissResult() {
            _uiState.value = SyncUiState.Idle
        }

        private fun reportFailure(error: Throwable) {
            if (error is UnauthorizedException) _unauthorizedEvent.tryEmit(Unit)
            _uiState.value = SyncUiState.Failure(error.remoteFailureKind())
        }
    }
