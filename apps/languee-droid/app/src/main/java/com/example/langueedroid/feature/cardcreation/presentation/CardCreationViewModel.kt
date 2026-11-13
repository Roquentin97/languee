package com.example.langueedroid.feature.cardcreation.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportResult
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.AnkiDroidNoteBuilder
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.ExportStatusNotifier
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExportPreference
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.di.ApplicationScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.coroutines.coroutineContext

data class CardCreatedEvent(
    val cardId: String,
    val definition: String,
    val deck: Deck,
)

@HiltViewModel(assistedFactory = CardCreationViewModel.Factory::class)
class CardCreationViewModel
    @AssistedInject
    constructor(
        @Assisted("targetWord") private val targetWord: String,
        @Assisted("context") private val context: String?,
        @Assisted("language") private val language: String,
        @Assisted("lookupContext") private val lookupContext: String? = null,
        @Assisted("selectionStart") private val selectionStart: Int? = null,
        @Assisted("selectionEnd") private val selectionEnd: Int? = null,
        @Assisted("offlineEntryId") private val offlineEntryId: String? = null,
        private val deckRepository: DeckRepository,
        private val vocabularyRepository: VocabularyRepository,
        private val cardRepository: CardRepository,
        private val ankiDroidExportRepository: AnkiDroidExportRepository,
        private val ankiDroidExportService: AnkiDroidExportService,
        private val prefsStore: AnkiDroidPreferencesStore,
        val speaker: Speaker,
        @ApplicationScope private val appScope: CoroutineScope,
        private val exportStatusNotifier: ExportStatusNotifier,
        private val offlineQueueRepository: OfflineQueueRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(
                @Assisted("targetWord") targetWord: String,
                @Assisted("context") context: String?,
                @Assisted("language") language: String,
                @Assisted("lookupContext") lookupContext: String?,
                @Assisted("selectionStart") selectionStart: Int?,
                @Assisted("selectionEnd") selectionEnd: Int?,
                @Assisted("offlineEntryId") offlineEntryId: String?,
            ): CardCreationViewModel
        }

        private val _state =
            MutableStateFlow(
                CardCreationState(
                    targetWord = targetWord,
                    context = context,
                    contextValid = context == null || EntryValidator.isContextWithinLimit(context),
                    contextTooLong = !EntryValidator.isContextWithinLimit(context),
                    language = language,
                    lookupContext = lookupContext ?: context,
                    selectionStart = selectionStart,
                    selectionEnd = selectionEnd,
                ),
            )
        val state: StateFlow<CardCreationState> = _state.asStateFlow()

        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

        private val _cardCreatedEvent = MutableSharedFlow<CardCreatedEvent>(replay = 1)
        val cardCreatedEvent: SharedFlow<CardCreatedEvent> = _cardCreatedEvent.asSharedFlow()

        private var createCardJob: Job? = null
        private var lookupJob: Job? = null
        private var initialDeckId: String? = null
        private var restoredDeckId: String? = null
        private var pendingEntry: OfflineEntry? = null

        fun setInitialDeck(id: String?) {
            initialDeckId = restoredDeckId ?: id
            val loaded = _state.value.deckSelectionState as? DeckSelectionState.Loaded ?: return
            if (loaded.selectedDeck == null) loaded.decks.firstOrNull { it.id == initialDeckId }?.let(::onDeckSelected)
        }

        init {
            viewModelScope.launch {
                try {
                    pendingEntry = offlineEntryId?.let { offlineQueueRepository.find(it) }
                } catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException) throw error
                    handleLookupFailure(error)
                    return@launch
                }
                restoredDeckId = pendingEntry?.pendingDeckId
                initialDeckId = restoredDeckId ?: initialDeckId
                loadDecks()
                lookupVocabulary()
            }
        }

        internal fun loadDecks() {
            viewModelScope.launch {
                val previouslySelectedDeckId =
                    (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck?.id
                _state.value = _state.value.copy(deckSelectionState = DeckSelectionState.Loading)
                deckRepository.getDecks().fold(
                    onSuccess = { decks ->
                        val selectedDeck =
                            when {
                                restoredDeckId != null -> decks.firstOrNull { it.id == restoredDeckId }
                                decks.size == 1 -> decks.single()
                                else ->
                                    decks.firstOrNull { it.id == previouslySelectedDeckId }
                                        ?: decks.firstOrNull { it.id == initialDeckId }
                            }
                        _state.value =
                            _state.value.copy(
                                deckSelectionState =
                                    if (decks.isEmpty()) {
                                        DeckSelectionState.Empty
                                    } else {
                                        DeckSelectionState.Loaded(decks = decks, selectedDeck = selectedDeck)
                                    },
                            )
                        selectedDeck?.let(::onDeckSelected)
                    },
                    onFailure = { error ->
                        if (error is UnauthorizedException) {
                            _unauthorizedEvent.tryEmit(Unit)
                        } else {
                            _state.value =
                                _state.value.copy(
                                    deckSelectionState = DeckSelectionState.Error(CardCreationError.LOAD_DECKS_FAILED),
                                )
                        }
                    },
                )
            }
        }

        fun onDeckSelected(deck: Deck) {
            val currentDeckState = _state.value.deckSelectionState as? DeckSelectionState.Loaded ?: return
            _state.value =
                _state.value.copy(
                    deckSelectionState = currentDeckState.copy(selectedDeck = deck),
                )

            // The lookup is deck-independent; a deck change only re-evaluates whether the
            // selected definition is already saved in the newly chosen deck.
            when (val currentFlowState = _state.value.flowState) {
                is CardCreationFlowState.DefinitionsLoaded -> {
                    _state.value =
                        _state.value.copy(
                            flowState =
                                currentFlowState.copy(
                                    definitionState =
                                        currentFlowState.selectedDefinition?.let {
                                            resolveDefinitionState(it, deck)
                                        },
                                ),
                        )
                }
                is CardCreationFlowState.SelectingExample -> {
                    _state.value =
                        _state.value.copy(
                            flowState =
                                currentFlowState.copy(
                                    definitionState = resolveDefinitionState(currentFlowState.selectedDefinition, deck),
                                ),
                        )
                }
                else -> Unit
            }
        }

        fun onContextChanged(value: String) {
            val updated = value.ifBlank { null }
            val current = _state.value
            val flow = current.flowState as? CardCreationFlowState.DefinitionsLoaded
            val updatedFlow =
                if (flow?.exampleConfirmed == true && flow.confirmedExample == current.context) {
                    flow.copy(confirmedExample = updated)
                } else {
                    current.flowState
                }
            _state.value =
                current.copy(
                    context = updated,
                    contextValid =
                        updated == null ||
                            (
                                EntryValidator.isContextWithinLimit(updated) &&
                                    (updated == context || EntryValidator.isContextValid(targetWord, updated))
                            ),
                    contextTooLong = !EntryValidator.isContextWithinLimit(updated),
                    flowState = updatedFlow,
                )
        }

        private fun lookupVocabulary(notice: CardCreationError? = null) {
            lookupJob?.cancel()
            lookupJob =
                viewModelScope.launch {
                    _state.value = _state.value.copy(flowState = CardCreationFlowState.LookingUp)
                    val lookupResult =
                        vocabularyRepository
                            .lookup(
                                word = targetWord,
                                language = language,
                                context =
                                    (
                                        if (pendingEntry?.pendingDefinitionId !=
                                            null
                                        ) {
                                            pendingEntry?.lookupContext
                                        } else {
                                            lookupContext ?: context
                                        }
                                    )?.takeIf(EntryValidator::isContextWithinLimit),
                                selectionStart =
                                    if (pendingEntry?.pendingDefinitionId !=
                                        null
                                    ) {
                                        pendingEntry?.selectionStart
                                    } else {
                                        selectionStart
                                    },
                                selectionEnd = if (pendingEntry?.pendingDefinitionId != null) pendingEntry?.selectionEnd else selectionEnd,
                            )
                    coroutineContext.ensureActive()
                    lookupResult.fold(
                        onSuccess = { result -> handleLookupSuccess(result, notice) },
                        onFailure = ::handleLookupFailure,
                    )
                }
        }

        private fun handleLookupSuccess(
            result: LookupResult,
            notice: CardCreationError?,
        ) {
            val (definitions, selected) = restorePending(result)
            if (result.definitions.isNotEmpty()) pendingEntry = null
            val deck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck
            val flow =
                when {
                    result.definitions.isEmpty() && result.providerMiss -> CardCreationFlowState.ManualDefinition()
                    result.definitions.isEmpty() -> CardCreationFlowState.NoDefinitions(lemma = result.lemma)
                    else ->
                        CardCreationFlowState.DefinitionsLoaded(
                            definitions = definitions,
                            selectedDefinition = selected,
                            definitionState = selected?.let { resolveDefinitionState(it, deck) },
                            lemma = result.lemma,
                            confirmedExample = if (selected != null) context else null,
                            exampleConfirmed = selected != null,
                            notice = notice,
                        )
                }
            _state.value = _state.value.copy(kind = result.kind, expressionContextFound = result.expressionContextFound, flowState = flow)
        }

        private fun restorePending(result: LookupResult): Pair<List<DefinitionResult>, DefinitionResult?> {
            val pending = pendingEntry ?: return result.definitions to null
            val chosen = result.definitions.firstOrNull { it.id == pending.pendingDefinitionId } ?: return result.definitions to null
            val forms: Map<String, String>? =
                pending.pendingInflectionForms?.let {
                    Gson().fromJson(it, object : TypeToken<Map<String, String>>() {}.type)
                }
            val restored = chosen.copy(lookupId = pending.pendingLookupId, inflectionForms = forms ?: chosen.inflectionForms)
            return result.definitions.map { if (it.id == restored.id) restored else it } to restored
        }

        private fun handleLookupFailure(error: Throwable) {
            if (error is UnauthorizedException) {
                _unauthorizedEvent.tryEmit(Unit)
                return
            }
            val reason =
                when (error) {
                    is ExpressionTooLongException -> CardCreationError.EXPRESSION_TOO_LONG
                    is LookupInputInvalidException -> CardCreationError.LOOKUP_INPUT_INVALID
                    else -> CardCreationError.LOOKUP_FAILED
                }
            _state.value = _state.value.copy(flowState = CardCreationFlowState.LookupError(reason))
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

        fun submitManualDefinition() {
            val current = _state.value.flowState as? CardCreationFlowState.ManualDefinition ?: return
            val definition = current.definitionText.trim()
            if (definition.isEmpty()) return
            val draft =
                DefinitionResult(
                    id = "",
                    partOfSpeech = "phrase",
                    definition = definition,
                    example = current.exampleText.trim().ifBlank { null },
                    provider = "user",
                    decks = emptyList(),
                )
            _state.value =
                _state.value.copy(
                    flowState =
                        CardCreationFlowState.SelectingExample(
                            definitions = listOf(draft),
                            lemma = targetWord,
                            selectedDefinition = draft,
                            definitionState = DefinitionState.Available,
                        ),
                )
        }

        fun onDefinitionSelected(definition: DefinitionResult) {
            val currentFlowState = _state.value.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return
            val selectedDeck = (_state.value.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck

            val definitionState = resolveDefinitionState(definition, selectedDeck)
            if (definitionState == DefinitionState.AlreadyInSelectedDeck) {
                _state.value =
                    _state.value.copy(
                        flowState =
                            currentFlowState.copy(
                                selectedDefinition = definition,
                                definitionState = definitionState,
                                confirmedExample = null,
                                exampleConfirmed = false,
                            ),
                    )
            } else {
                _state.value =
                    _state.value.copy(
                        flowState =
                            CardCreationFlowState.SelectingExample(
                                definitions = currentFlowState.definitions,
                                lemma = currentFlowState.lemma,
                                selectedDefinition = definition,
                                definitionState = definitionState,
                                previous = currentFlowState,
                            ),
                    )
            }
        }

        fun onExampleConfirmed(example: String?) {
            val currentFlowState = _state.value.flowState as? CardCreationFlowState.SelectingExample ?: return
            _state.value =
                _state.value.copy(
                    flowState =
                        CardCreationFlowState.DefinitionsLoaded(
                            definitions = currentFlowState.definitions,
                            lemma = currentFlowState.lemma,
                            selectedDefinition = currentFlowState.selectedDefinition,
                            definitionState = currentFlowState.definitionState,
                            confirmedExample = example,
                            exampleConfirmed = true,
                        ),
                )
        }

        fun onBackFromExampleSelection() {
            val currentFlowState = _state.value.flowState as? CardCreationFlowState.SelectingExample ?: return
            _state.value =
                _state.value.copy(
                    flowState =
                        currentFlowState.previous ?: CardCreationFlowState.DefinitionsLoaded(
                            definitions = currentFlowState.definitions,
                            lemma = currentFlowState.lemma,
                            selectedDefinition = null,
                            definitionState = null,
                            confirmedExample = null,
                        ),
                )
        }

        private fun resolveDefinitionState(
            definition: DefinitionResult,
            deck: Deck?,
        ): DefinitionState {
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
            val draftContext = _state.value.context
            if (!_state.value.contextValid) return

            if (currentFlowState.definitionState == DefinitionState.AlreadyInSelectedDeck) return
            if (!currentFlowState.exampleConfirmed) return

            val confirmedExample = currentFlowState.confirmedExample
            createCardJob =
                appScope.launch {
                    _state.value = _state.value.copy(flowState = CardCreationFlowState.CreatingCard)
                    val resolvedDefinition = resolveDraftDefinition(selectedDefinition, currentFlowState) ?: return@launch
                    val resolvedFlow =
                        currentFlowState.copy(
                            definitions = currentFlowState.definitions.map { if (it == selectedDefinition) resolvedDefinition else it },
                            selectedDefinition = resolvedDefinition,
                        )
                    cardRepository
                        .createCard(
                            deckId = selectedDeck.id,
                            definitionId = resolvedDefinition.id,
                            context = confirmedExample ?: draftContext,
                            inflectionForms = resolvedDefinition.inflectionForms,
                            lookupId = resolvedDefinition.lookupId,
                        ).fold(
                            onSuccess = { cardId ->
                                _state.value = _state.value.copy(flowState = CardCreationFlowState.CardCreated())
                                _cardCreatedEvent.tryEmit(CardCreatedEvent(cardId, resolvedDefinition.definition, selectedDeck))
                                triggerAnkiExportIfConfigured(
                                    cardId = cardId,
                                    selectedDefinition = resolvedDefinition,
                                    currentFlowState = resolvedFlow,
                                    selectedDeck = selectedDeck,
                                    confirmedExample = confirmedExample,
                                )
                            },
                            onFailure = { error -> handleCreateFailure(error, resolvedFlow) },
                        )
                }
        }

        private fun handleCreateFailure(
            error: Throwable,
            flow: CardCreationFlowState.DefinitionsLoaded,
        ) {
            when (error) {
                is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                is CardAlreadyExistsException ->
                    _state.value =
                        _state.value.copy(
                            flowState = flow.copy(definitionState = DefinitionState.AlreadyInSelectedDeck),
                        )
                is StaleReferenceException -> {
                    initialDeckId = null
                    _state.value = _state.value.copy(flowState = flow.copy(notice = CardCreationError.STALE_REFERENCE))
                    loadDecks()
                }
                else -> _state.value = _state.value.copy(flowState = flow.copy(notice = CardCreationError.CREATE_CARD_FAILED))
            }
        }

        private suspend fun resolveDraftDefinition(
            definition: DefinitionResult,
            flow: CardCreationFlowState.DefinitionsLoaded,
        ): DefinitionResult? {
            if (definition.id.isNotEmpty()) return definition
            val result =
                vocabularyRepository.createUserDefinition(
                    text = targetWord,
                    definition = definition.definition,
                    language = language,
                    example = definition.example,
                )
            return result.fold(
                onSuccess = { created ->
                    definition.copy(id = created.id, partOfSpeech = created.partOfSpeech, provider = created.provider)
                },
                onFailure = { error ->
                    when (error) {
                        is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                        is DefinitionAlreadyExistsException -> lookupVocabulary(notice = CardCreationError.DEFINITION_ALREADY_EXISTS)
                        else -> _state.value = _state.value.copy(flowState = flow.copy(notice = CardCreationError.MANUAL_DEFINITION_FAILED))
                    }
                    null
                },
            )
        }

        private fun triggerAnkiExportIfConfigured(
            cardId: String,
            selectedDefinition: DefinitionResult,
            currentFlowState: CardCreationFlowState.DefinitionsLoaded,
            selectedDeck: Deck,
            confirmedExample: String?,
        ) {
            val errorHandler =
                CoroutineExceptionHandler { _, _ ->
                    finishExport(AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED))
                }
            appScope.launch(errorHandler) {
                val setupResult = ankiDroidExportService.checkSetup(prefsStore)
                if (!setupResult.isReady) {
                    finishExport(AnkiExportTriggerStatus.NotTriggered)
                    return@launch
                }

                val prefs = prefsStore.read()

                // Always create the pending export record, even for MANUAL preference, so the
                // Sync screen can find and attempt it later. Only the actual AnkiDroid write is
                // gated on AUTO.
                val exportRecordResult = ankiDroidExportRepository.createOrGetExportRecord(cardId)
                val exportRecord =
                    exportRecordResult.getOrNull() ?: run {
                        finishExport(AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED))
                        return@launch
                    }

                if (prefs.exportPreference != ExportPreference.AUTO) {
                    finishExport(AnkiExportTriggerStatus.NotTriggered)
                    return@launch
                }

                _state.value =
                    _state.value.copy(
                        flowState =
                            CardCreationFlowState.CardCreated(
                                ankiExportStatus = AnkiExportTriggerStatus.InProgress,
                            ),
                    )

                val fields = buildExportFields(cardId, selectedDefinition, currentFlowState, confirmedExample)

                val noteResult =
                    ankiDroidExportService.exportNote(
                        noteTypeName = prefs.noteTypeName,
                        deckName = selectedDeck.name,
                        fields = fields,
                        cardId = cardId,
                    )

                noteResult.fold(
                    onSuccess = { result ->
                        recordSuccessfulExport(exportRecord.id, result, selectedDeck.name, prefs.noteTypeName)
                    },
                    onFailure = { error ->
                        ankiDroidExportRepository.recordAttemptFailed(
                            exportId = exportRecord.id,
                            failureReason = error.javaClass.simpleName,
                            failureMessage = error.message ?: "",
                        )
                        finishExport(AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED))
                    },
                )
            }
        }

        private suspend fun recordSuccessfulExport(
            exportId: String,
            result: AnkiDroidExportResult,
            deckName: String,
            modelName: String,
        ) {
            val recorded =
                ankiDroidExportRepository.recordAttemptCompleted(
                    exportId = exportId,
                    ankiNoteId = result.noteId,
                    ankiDeckId = result.deckId,
                    ankiDeckNameSnapshot = deckName,
                    ankiModelId = result.modelId,
                    ankiModelNameSnapshot = modelName,
                    templateVersion = NoteTypeTemplates.TEMPLATE_VERSION,
                )
            finishExport(
                if (recorded.isSuccess) {
                    AnkiExportTriggerStatus.Success
                } else {
                    AnkiExportTriggerStatus.Failed(CardCreationError.EXPORT_RECORD_FAILED)
                },
            )
        }

        private fun buildExportFields(
            cardId: String,
            selectedDefinition: DefinitionResult,
            currentFlowState: CardCreationFlowState.DefinitionsLoaded,
            confirmedExample: String?,
        ) = AnkiDroidNoteBuilder.buildFields(
            cardId = cardId,
            word = selectedDefinition.lemma ?: currentFlowState.lemma,
            lemma = selectedDefinition.lemma ?: currentFlowState.lemma,
            partOfSpeech = selectedDefinition.partOfSpeech,
            definition = selectedDefinition.definition,
            context = _state.value.context,
            example = confirmedExample,
            inflectionForms = selectedDefinition.inflectionForms,
        )

        private fun finishExport(status: AnkiExportTriggerStatus) {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.CardCreated(ankiExportStatus = status))
            if (status is AnkiExportTriggerStatus.Failed) exportStatusNotifier.reportFailure()
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
