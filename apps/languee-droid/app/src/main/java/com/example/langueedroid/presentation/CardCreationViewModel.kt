package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.domain.CardAlreadyExistsException
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.DefinitionState
import com.example.langueedroid.domain.ExportPreference
import com.example.langueedroid.domain.StaleReferenceException
import com.example.langueedroid.domain.UnauthorizedException
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CardCreationViewModel @AssistedInject constructor(
    @Assisted("targetWord") private val targetWord: String,
    @Assisted("context") private val context: String?,
    private val deckRepository: DeckRepository,
    private val vocabularyRepository: VocabularyRepository,
    private val cardRepository: CardRepository,
    private val ankiDroidExportRepository: AnkiDroidExportRepository,
    private val ankiDroidExportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("targetWord") targetWord: String,
            @Assisted("context") context: String?,
        ): CardCreationViewModel
    }

    private val _state = MutableStateFlow(
        CardCreationState(targetWord = targetWord, context = context),
    )
    val state: StateFlow<CardCreationState> = _state.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    private val _cardCreatedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val cardCreatedEvent: SharedFlow<Unit> = _cardCreatedEvent.asSharedFlow()

    private var createCardJob: Job? = null

    init {
        loadDecks()
    }

    internal fun loadDecks() {
        viewModelScope.launch {
            _state.value = _state.value.copy(deckSelectionState = DeckSelectionState.Loading)
            deckRepository.getDecks().fold(
                onSuccess = { decks ->
                    _state.value = _state.value.copy(
                        deckSelectionState = if (decks.isEmpty()) {
                            DeckSelectionState.Empty
                        } else {
                            DeckSelectionState.Loaded(decks = decks, selectedDeck = null)
                        },
                        flowState = CardCreationFlowState.SelectingDeck,
                    )
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _state.value = _state.value.copy(
                            deckSelectionState = DeckSelectionState.Error(
                                error.message ?: "Failed to load decks",
                            ),
                        )
                    }
                },
            )
        }
    }

    fun onDeckSelected(deck: Deck) {
        val currentDeckState = _state.value.deckSelectionState as? DeckSelectionState.Loaded ?: return
        _state.value = _state.value.copy(
            deckSelectionState = currentDeckState.copy(selectedDeck = deck),
        )

        val currentFlowState = _state.value.flowState
        when (currentFlowState) {
            is CardCreationFlowState.SelectingDeck -> lookupVocabulary(deck)
            is CardCreationFlowState.DefinitionsLoaded -> {
                // Deck changed while definitions are shown — re-evaluate definition state then re-fetch.
                _state.value = _state.value.copy(
                    flowState = currentFlowState.copy(
                        selectedDefinition = currentFlowState.selectedDefinition,
                        definitionState = currentFlowState.selectedDefinition?.let {
                            resolveDefinitionState(it, deck)
                        },
                    ),
                )
                lookupVocabulary(deck)
            }
            is CardCreationFlowState.SelectingExample -> lookupVocabulary(deck)
            else -> Unit
        }
    }

    private fun lookupVocabulary(deck: Deck) {
        viewModelScope.launch {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.LookingUp)
            vocabularyRepository.lookup(
                word = targetWord,
                context = context,
            ).fold(
                onSuccess = { result ->
                    _state.value = _state.value.copy(
                        flowState = if (result.definitions.isEmpty()) {
                            CardCreationFlowState.NoDefinitions(lemma = result.lemma)
                        } else {
                            CardCreationFlowState.DefinitionsLoaded(
                                definitions = result.definitions,
                                selectedDefinition = null,
                                definitionState = null,
                                lemma = result.lemma,
                            )
                        },
                    )
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.LookupError(
                                error.message ?: "Vocabulary lookup failed",
                            ),
                        )
                    }
                },
            )
        }
    }

    fun onDefinitionSelected(definition: DefinitionResult) {
        val currentFlowState = _state.value.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return
        val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck ?: return

        val definitionState = resolveDefinitionState(definition, selectedDeck)
        if (definitionState == DefinitionState.AlreadyInSelectedDeck) {
            _state.value = _state.value.copy(
                flowState = currentFlowState.copy(
                    selectedDefinition = definition,
                    definitionState = definitionState,
                    confirmedExample = null,
                ),
            )
        } else {
            _state.value = _state.value.copy(
                flowState = CardCreationFlowState.SelectingExample(
                    definitions = currentFlowState.definitions,
                    lemma = currentFlowState.lemma,
                    selectedDefinition = definition,
                    definitionState = definitionState,
                ),
            )
        }
    }

    fun onExampleConfirmed(example: String?) {
        val currentFlowState = _state.value.flowState as? CardCreationFlowState.SelectingExample ?: return
        _state.value = _state.value.copy(
            flowState = CardCreationFlowState.DefinitionsLoaded(
                definitions = currentFlowState.definitions,
                lemma = currentFlowState.lemma,
                selectedDefinition = currentFlowState.selectedDefinition,
                definitionState = currentFlowState.definitionState,
                confirmedExample = example,
            ),
        )
    }

    fun onBackFromExampleSelection() {
        val currentFlowState = _state.value.flowState as? CardCreationFlowState.SelectingExample ?: return
        _state.value = _state.value.copy(
            flowState = CardCreationFlowState.DefinitionsLoaded(
                definitions = currentFlowState.definitions,
                lemma = currentFlowState.lemma,
                selectedDefinition = null,
                definitionState = null,
                confirmedExample = null,
            ),
        )
    }

    private fun resolveDefinitionState(definition: DefinitionResult, deck: Deck): DefinitionState {
        val deckIds = definition.decks.map { it.id }
        return when {
            deck.id in deckIds -> DefinitionState.AlreadyInSelectedDeck
            deckIds.isNotEmpty() -> DefinitionState.ExistsInAnotherDeck
            else -> DefinitionState.Available
        }
    }

    fun createCard() {
        if (createCardJob?.isActive == true) return

        val currentFlowState = _state.value.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return
        val selectedDefinition = currentFlowState.selectedDefinition ?: return
        val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck ?: return

        if (currentFlowState.definitionState == DefinitionState.AlreadyInSelectedDeck) return

        val confirmedExample = currentFlowState.confirmedExample
        createCardJob = viewModelScope.launch {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.CreatingCard)
            cardRepository.createCard(
                deckId = selectedDeck.id,
                definitionId = selectedDefinition.id,
                context = context,
                inflectionForms = selectedDefinition.inflectionForms,
            ).fold(
                onSuccess = { cardId ->
                    triggerAnkiExportIfConfigured(
                        cardId = cardId,
                        selectedDefinition = selectedDefinition,
                        currentFlowState = currentFlowState,
                        selectedDeck = selectedDeck,
                        confirmedExample = confirmedExample,
                    )
                },
                onFailure = { error ->
                    when (error) {
                        is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                        is CardAlreadyExistsException -> _state.value = _state.value.copy(
                            flowState = currentFlowState.copy(
                                selectedDefinition = selectedDefinition,
                                definitionState = DefinitionState.AlreadyInSelectedDeck,
                            ),
                        )
                        is StaleReferenceException -> {
                            _state.value = _state.value.copy(
                                flowState = CardCreationFlowState.CreateCardError("Deck or definition no longer exists"),
                            )
                            loadDecks()
                        }
                        else -> _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.CreateCardError(
                                error.message ?: "Failed to create card",
                            ),
                        )
                    }
                },
            )
        }
    }

    private fun triggerAnkiExportIfConfigured(
        cardId: String,
        selectedDefinition: DefinitionResult,
        currentFlowState: CardCreationFlowState.DefinitionsLoaded,
        selectedDeck: Deck,
        confirmedExample: String?,
    ) {
        viewModelScope.launch {
            val setupResult = ankiDroidExportService.checkSetup(prefsStore)
            if (!setupResult.isReady) {
                _state.value = _state.value.copy(
                    flowState = CardCreationFlowState.CardCreated(
                        ankiExportStatus = AnkiExportTriggerStatus.NotTriggered,
                    ),
                )
                _cardCreatedEvent.tryEmit(Unit)
                return@launch
            }

            val prefs = prefsStore.read()

            // Always create the pending export record, even for MANUAL preference, so the
            // Sync screen can find and attempt it later. Only the actual AnkiDroid write is
            // gated on AUTO.
            val exportRecordResult = ankiDroidExportRepository.createOrGetExportRecord(cardId)
            val exportRecord = exportRecordResult.getOrNull() ?: run {
                _state.value = _state.value.copy(
                    flowState = CardCreationFlowState.CardCreated(
                        ankiExportStatus = AnkiExportTriggerStatus.Failed(
                            exportRecordResult.exceptionOrNull()?.message ?: "Failed to create export record",
                        ),
                    ),
                )
                _cardCreatedEvent.tryEmit(Unit)
                return@launch
            }

            if (prefs.exportPreference != ExportPreference.AUTO) {
                _state.value = _state.value.copy(
                    flowState = CardCreationFlowState.CardCreated(
                        ankiExportStatus = AnkiExportTriggerStatus.NotTriggered,
                    ),
                )
                _cardCreatedEvent.tryEmit(Unit)
                return@launch
            }

            _state.value = _state.value.copy(
                flowState = CardCreationFlowState.CardCreated(
                    ankiExportStatus = AnkiExportTriggerStatus.InProgress,
                ),
            )

            val fields = AnkiDroidNoteBuilder.buildFields(
                cardId = cardId,
                word = currentFlowState.lemma,
                lemma = currentFlowState.lemma,
                partOfSpeech = selectedDefinition.partOfSpeech,
                definition = selectedDefinition.definition,
                context = context,
                example = confirmedExample,
                inflectionForms = selectedDefinition.inflectionForms,
            )

            val noteResult = ankiDroidExportService.exportNote(
                noteTypeName = prefs.noteTypeName,
                deckName = selectedDeck.name,
                fields = fields,
                cardId = cardId,
            )

            noteResult.fold(
                onSuccess = { result ->
                    ankiDroidExportRepository.recordAttemptCompleted(
                        exportId = exportRecord.id,
                        ankiNoteId = result.noteId,
                        ankiDeckId = result.deckId,
                        ankiDeckNameSnapshot = selectedDeck.name,
                        ankiModelId = result.modelId,
                        ankiModelNameSnapshot = prefs.noteTypeName,
                        templateVersion = NoteTypeTemplates.TEMPLATE_VERSION,
                    )
                    _state.value = _state.value.copy(
                        flowState = CardCreationFlowState.CardCreated(
                            ankiExportStatus = AnkiExportTriggerStatus.Success,
                        ),
                    )
                    _cardCreatedEvent.tryEmit(Unit)
                },
                onFailure = { error ->
                    ankiDroidExportRepository.recordAttemptFailed(
                        exportId = exportRecord.id,
                        failureReason = error.javaClass.simpleName,
                        failureMessage = error.message ?: "",
                    )
                    _state.value = _state.value.copy(
                        flowState = CardCreationFlowState.CardCreated(
                            ankiExportStatus = AnkiExportTriggerStatus.Failed(
                                error.message ?: "Export failed",
                            ),
                        ),
                    )
                    _cardCreatedEvent.tryEmit(Unit)
                },
            )
        }
    }

    fun retryLookup() {
        val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck ?: return
        lookupVocabulary(selectedDeck)
    }

    fun dismissError() {
        val currentFlowState = _state.value.flowState
        if (currentFlowState is CardCreationFlowState.CreateCardError) {
            // Return to definitions state if possible, otherwise to selecting deck.
            _state.value = _state.value.copy(flowState = CardCreationFlowState.SelectingDeck)
            val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck
            if (selectedDeck != null) {
                lookupVocabulary(selectedDeck)
            }
        }
    }

}
