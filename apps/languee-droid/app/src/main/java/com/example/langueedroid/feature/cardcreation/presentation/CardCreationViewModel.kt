package com.example.langueedroid.feature.cardcreation.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.ExportPreference
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel(assistedFactory = CardCreationViewModel.Factory::class)
class CardCreationViewModel @AssistedInject constructor(
    @Assisted("targetWord") private val targetWord: String,
    @Assisted("context") private val context: String?,
    @Assisted("language") private val language: String,
    private val deckRepository: DeckRepository,
    private val vocabularyRepository: VocabularyRepository,
    private val cardRepository: CardRepository,
    private val ankiDroidExportRepository: AnkiDroidExportRepository,
    private val ankiDroidExportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
    val speaker: Speaker,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("targetWord") targetWord: String,
            @Assisted("context") context: String?,
            @Assisted("language") language: String,
        ): CardCreationViewModel
    }

    private val _state = MutableStateFlow(
        CardCreationState(targetWord = targetWord, context = context, language = language),
    )
    val state: StateFlow<CardCreationState> = _state.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    private val _cardCreatedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val cardCreatedEvent: SharedFlow<Unit> = _cardCreatedEvent.asSharedFlow()

    private var createCardJob: Job? = null
    private var manualDefinitionJob: Job? = null

    init {
        loadDecks()
        lookupVocabulary()
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
                    )
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _state.value = _state.value.copy(
                            deckSelectionState = DeckSelectionState.Error(CardCreationError.LOAD_DECKS_FAILED),
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

        // The lookup is deck-independent; a deck change only re-evaluates whether the
        // selected definition is already saved in the newly chosen deck.
        when (val currentFlowState = _state.value.flowState) {
            is CardCreationFlowState.DefinitionsLoaded -> {
                _state.value = _state.value.copy(
                    flowState = currentFlowState.copy(
                        definitionState = currentFlowState.selectedDefinition?.let {
                            resolveDefinitionState(it, deck)
                        },
                    ),
                )
            }
            is CardCreationFlowState.SelectingExample -> {
                _state.value = _state.value.copy(
                    flowState = currentFlowState.copy(
                        definitionState = resolveDefinitionState(currentFlowState.selectedDefinition, deck),
                    ),
                )
            }
            else -> Unit
        }
    }

    private fun lookupVocabulary(notice: CardCreationError? = null) {
        viewModelScope.launch {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.LookingUp)
            vocabularyRepository.lookup(
                word = targetWord,
                language = language,
                context = context,
            ).fold(
                onSuccess = { result ->
                    _state.value = _state.value.copy(
                        kind = result.kind,
                        expressionContextFound = result.expressionContextFound,
                        flowState = when {
                            result.definitions.isEmpty() && result.providerMiss ->
                                CardCreationFlowState.ManualDefinition()
                            result.definitions.isEmpty() ->
                                CardCreationFlowState.NoDefinitions(lemma = result.lemma)
                            else -> CardCreationFlowState.DefinitionsLoaded(
                                definitions = result.definitions,
                                selectedDefinition = null,
                                definitionState = null,
                                lemma = result.lemma,
                                notice = notice,
                            )
                        },
                    )
                },
                onFailure = { error ->
                    when (error) {
                        is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                        is ExpressionTooLongException -> _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.LookupError(CardCreationError.EXPRESSION_TOO_LONG),
                        )
                        is LookupInputInvalidException -> _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.LookupError(CardCreationError.LOOKUP_INPUT_INVALID),
                        )
                        else -> _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.LookupError(CardCreationError.LOOKUP_FAILED),
                        )
                    }
                },
            )
        }
    }

    /** Called when the user edits the definition text in the manual-definition form. */
    fun onManualDefinitionTextChanged(text: String) {
        val current = _state.value.flowState as? CardCreationFlowState.ManualDefinition ?: return
        _state.value = _state.value.copy(flowState = current.copy(definitionText = text, error = null))
    }

    /** Called when the user edits the optional example text in the manual-definition form. */
    fun onManualExampleTextChanged(text: String) {
        val current = _state.value.flowState as? CardCreationFlowState.ManualDefinition ?: return
        _state.value = _state.value.copy(flowState = current.copy(exampleText = text, error = null))
    }

    /**
     * Submits the manual definition entered by the user for an expression the dictionary
     * provider does not know. On success, the returned definition becomes the selected
     * definition and the flow proceeds to example selection exactly as if it had been
     * picked from a provider-returned list. On 409 (an identical definition already
     * exists), surfaces a notice and re-fetches the lookup so the existing definition
     * appears in the normal definitions list.
     */
    fun submitManualDefinition() {
        if (manualDefinitionJob?.isActive == true) return

        val current = _state.value.flowState as? CardCreationFlowState.ManualDefinition ?: return
        val definitionText = current.definitionText.trim()
        if (definitionText.isEmpty()) return
        val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck

        manualDefinitionJob = viewModelScope.launch {
            _state.value = _state.value.copy(flowState = current.copy(isSubmitting = true, error = null))
            vocabularyRepository.createUserDefinition(
                text = targetWord,
                definition = definitionText,
                language = language,
                example = current.exampleText.trim().ifBlank { null },
            ).fold(
                onSuccess = { created ->
                    val definitionResult = DefinitionResult(
                        id = created.id,
                        partOfSpeech = created.partOfSpeech,
                        definition = created.definition,
                        example = created.example,
                        provider = created.provider,
                        decks = emptyList(),
                    )
                    _state.value = _state.value.copy(
                        kind = created.kind,
                        flowState = CardCreationFlowState.SelectingExample(
                            definitions = listOf(definitionResult),
                            lemma = created.lemma,
                            selectedDefinition = definitionResult,
                            definitionState = resolveDefinitionState(definitionResult, selectedDeck),
                        ),
                    )
                },
                onFailure = { error ->
                    when (error) {
                        is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                        is DefinitionAlreadyExistsException ->
                            lookupVocabulary(notice = CardCreationError.DEFINITION_ALREADY_EXISTS)
                        else -> _state.value = _state.value.copy(
                            flowState = current.copy(isSubmitting = false, error = CardCreationError.MANUAL_DEFINITION_FAILED),
                        )
                    }
                },
            )
        }
    }

    fun onDefinitionSelected(definition: DefinitionResult) {
        val currentFlowState = _state.value.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return
        val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck

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

    private fun resolveDefinitionState(definition: DefinitionResult, deck: Deck?): DefinitionState {
        val deckIds = definition.decks.map { it.id }
        return when {
            deck != null && deck.id in deckIds -> DefinitionState.AlreadyInSelectedDeck
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
                                flowState = CardCreationFlowState.CreateCardError(CardCreationError.STALE_REFERENCE),
                            )
                            loadDecks()
                        }
                        else -> _state.value = _state.value.copy(
                            flowState = CardCreationFlowState.CreateCardError(CardCreationError.CREATE_CARD_FAILED),
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
                        ankiExportStatus = AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED),
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
                            ankiExportStatus = AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED),
                        ),
                    )
                    _cardCreatedEvent.tryEmit(Unit)
                },
            )
        }
    }

    fun retryLookup() {
        lookupVocabulary()
    }

    fun dismissError() {
        if (_state.value.flowState is CardCreationFlowState.CreateCardError) {
            lookupVocabulary()
        }
    }

}
