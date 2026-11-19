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
import com.example.langueedroid.core.domain.ContextTooLongException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExportPreference
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupAlternative
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.VocabularyNotFoundException
import com.example.langueedroid.core.domain.remoteFailureKind
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
    val targetRanges: List<SelectionRange>,
    val capturedContext: String?,
    val targetWord: String,
)

private data class ContextRangeValidation(
    val rangesMatch: Boolean,
    val selectionInvalidated: Boolean,
    val safeRanges: List<SelectionRange>,
    val safeTargetRanges: List<SelectionRange>,
    val alternatives: List<LookupAlternative>,
    val alternativesInvalidated: Boolean,
)

@HiltViewModel(assistedFactory = CardCreationViewModel.Factory::class)
class CardCreationViewModel
    @AssistedInject
    constructor(
        @Assisted("targetWord") private val targetWord: String,
        @Assisted("context") private val context: String?,
        @Assisted("language") private val language: String,
        @Assisted("lookupContext") private val lookupContext: String? = null,
        @Assisted("selectionRanges") private val selectionRanges: List<SelectionRange> = emptyList(),
        @Assisted("targetRanges") private val targetRanges: List<SelectionRange> = selectionRanges,
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
                @Assisted("selectionRanges") selectionRanges: List<SelectionRange>,
                @Assisted("targetRanges") targetRanges: List<SelectionRange>,
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
                    selectionRanges = selectionRanges,
                    targetRanges = targetRanges,
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
        private var originalLookupState: CardCreationState? = null
        private var originalLookupResult: LookupResult? = null
        private var activeLookupResult: LookupResult? = null

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
                pendingEntry?.let { entry ->
                    _state.value =
                        _state.value.copy(
                            lookupContext = entry.lookupContext ?: _state.value.lookupContext,
                            selectionRanges = entry.selectionRanges,
                            targetRanges = entry.targetRanges,
                            includeSuggestions = entry.includeSuggestions,
                        )
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
                                    deckSelectionState =
                                        DeckSelectionState.Error(
                                            error.toCardCreationError(CardCreationError.LOAD_DECKS_FAILED),
                                        ),
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
            val validation = validateContextRanges(current, updated)
            val snapshotInvalidated = updateOriginalLookupContext(updated)
            val canReturnToOriginal = originalLookupState != null
            _state.value =
                current.copy(
                    context = updated,
                    lookupContext = updated,
                    selectionRanges = validation.safeRanges,
                    targetRanges = validation.safeTargetRanges,
                    alternatives = validation.alternatives,
                    displayedAlternative = current.displayedAlternative.takeIf { validation.rangesMatch && canReturnToOriginal },
                    alternativeLookupStatus = contextChangeStatus(current, validation, snapshotInvalidated, canReturnToOriginal),
                    contextValid = isContextValid(current.targetWord, updated, validation.safeRanges),
                    contextTooLong = !EntryValidator.isContextWithinLimit(updated),
                    flowState = updateConfirmedExample(current, updated),
                )
        }

        private fun validateContextRanges(
            current: CardCreationState,
            context: String?,
        ): ContextRangeValidation {
            val rangesMatch =
                current.selectionRanges.isEmpty() ||
                    SelectionRanges.matchesTarget(context, current.selectionRanges, current.targetWord)
            val safeTargetRanges =
                current.targetRanges
                    .takeIf {
                        rangesMatch && SelectionRanges.matchesTarget(context, it, current.targetWord)
                    }.orEmpty()
            val alternatives = current.alternatives.filter { SelectionRanges.matchesTarget(context, it.selectionRanges, it.text) }
            return ContextRangeValidation(
                rangesMatch = rangesMatch,
                selectionInvalidated = current.selectionRanges.isNotEmpty() && !rangesMatch,
                safeRanges = current.selectionRanges.takeIf { rangesMatch }.orEmpty(),
                safeTargetRanges = safeTargetRanges,
                alternatives = alternatives,
                alternativesInvalidated = alternatives.size != current.alternatives.size,
            )
        }

        private fun updateOriginalLookupContext(context: String?): Boolean {
            val snapshot = originalLookupState ?: return false
            val snapshotValid =
                snapshot.selectionRanges.isEmpty() ||
                    SelectionRanges.matchesTarget(context, snapshot.selectionRanges, snapshot.targetWord)
            if (!snapshotValid) {
                originalLookupState = null
                originalLookupResult = null
                return true
            }
            originalLookupState =
                snapshot.copy(
                    context = context,
                    lookupContext = context,
                    alternatives = snapshot.alternatives.filter { SelectionRanges.matchesTarget(context, it.selectionRanges, it.text) },
                )
            return false
        }

        private fun contextChangeStatus(
            current: CardCreationState,
            validation: ContextRangeValidation,
            snapshotInvalidated: Boolean,
            canReturnToOriginal: Boolean,
        ): AlternativeLookupStatus =
            if (validation.selectionInvalidated ||
                validation.alternativesInvalidated ||
                snapshotInvalidated ||
                (current.displayedAlternative != null && !canReturnToOriginal)
            ) {
                AlternativeLookupStatus.SelectionChanged
            } else {
                AlternativeLookupStatus.Idle
            }

        private fun isContextValid(
            targetWord: String,
            context: String?,
            ranges: List<SelectionRange>,
        ): Boolean =
            context == null ||
                (
                    EntryValidator.isContextWithinLimit(
                        context,
                    ) &&
                        (ranges.isNotEmpty() || EntryValidator.isContextValid(targetWord, context))
                )

        private fun updateConfirmedExample(
            current: CardCreationState,
            context: String?,
        ): CardCreationFlowState {
            val flow = current.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return current.flowState
            return if (flow.exampleConfirmed && flow.confirmedExample == current.context) {
                flow.copy(confirmedExample = context)
            } else {
                current.flowState
            }
        }

        private fun lookupVocabulary(notice: CardCreationError? = null) {
            lookupJob?.cancel()
            originalLookupState = null
            originalLookupResult = null
            lookupJob =
                viewModelScope.launch {
                    val current = _state.value
                    _state.value =
                        current.copy(flowState = CardCreationFlowState.LookingUp, alternativeLookupStatus = AlternativeLookupStatus.Idle)
                    val requestContext =
                        (current.lookupContext ?: current.context)
                            ?.takeIf(EntryValidator::isContextWithinLimit)
                    val requestedRanges = current.selectionRanges
                    val safeRanges =
                        requestedRanges
                            .takeIf {
                                SelectionRanges.matchesTarget(
                                    requestContext,
                                    it,
                                    current.targetWord,
                                )
                            }.orEmpty()
                    if (safeRanges.isEmpty() && requestedRanges.isNotEmpty()) {
                        _state.value = _state.value.copy(selectionRanges = emptyList(), targetRanges = emptyList())
                    }
                    val lookupResult =
                        vocabularyRepository.lookup(
                            text = current.targetWord,
                            language = current.language,
                            context = requestContext,
                            selectionRanges = safeRanges,
                            includeSuggestions = current.includeSuggestions,
                        )
                    coroutineContext.ensureActive()
                    lookupResult.fold(
                        onSuccess = { result -> handleLookupSuccess(result, notice) },
                        onFailure = ::handleLookupFailure,
                    )
                }
        }

        fun lookupAlternative(alternative: LookupAlternative) {
            if (createCardJob?.isActive == true) return
            val current = _state.value
            val exactContext = (current.lookupContext ?: current.context)?.takeIf(EntryValidator::isContextWithinLimit)
            if (!SelectionRanges.matchesTarget(exactContext, alternative.selectionRanges, alternative.text)) {
                _state.value = current.copy(alternativeLookupStatus = AlternativeLookupStatus.SelectionChanged)
                return
            }
            if (originalLookupState == null) {
                originalLookupState = current.copy(alternativeLookupStatus = AlternativeLookupStatus.Idle)
                originalLookupResult = activeLookupResult
            }
            val originalState = originalLookupState ?: return
            _state.value = _state.value.copy(alternativeLookupStatus = AlternativeLookupStatus.Loading)
            lookupJob?.cancel()
            lookupJob =
                viewModelScope.launch {
                    val result =
                        vocabularyRepository.lookup(
                            text = alternative.text,
                            language = originalState.language,
                            context = exactContext,
                            selectionRanges = alternative.selectionRanges,
                            includeSuggestions = false,
                        )
                    coroutineContext.ensureActive()
                    result.fold(
                        onSuccess = { lookup ->
                            if (lookup.definitions.isEmpty()) {
                                _state.value = originalState.copy(alternativeLookupStatus = AlternativeLookupStatus.Miss)
                            } else {
                                activeLookupResult = lookup
                                _state.value =
                                    stateForLookup(
                                        base = originalState,
                                        result = lookup,
                                        target = alternative.text,
                                        ranges = alternative.selectionRanges,
                                        alternative = alternative,
                                    )
                            }
                        },
                        onFailure = { error ->
                            when (error) {
                                is UnauthorizedException -> _unauthorizedEvent.tryEmit(Unit)
                                is VocabularyNotFoundException -> {
                                    _state.value = originalState.copy(alternativeLookupStatus = AlternativeLookupStatus.Miss)
                                }
                                else -> _state.value = originalState.copy(alternativeLookupStatus = AlternativeLookupStatus.Failed)
                            }
                        },
                    )
                }
        }

        fun returnToOriginalLookup() {
            if (createCardJob?.isActive == true) return
            lookupJob?.cancel()
            val original = originalLookupState ?: return
            activeLookupResult = originalLookupResult
            _state.value = original.copy(alternativeLookupStatus = AlternativeLookupStatus.Idle)
            originalLookupState = null
            originalLookupResult = null
        }

        private fun handleLookupSuccess(
            result: LookupResult,
            notice: CardCreationError?,
        ) {
            activeLookupResult = result
            _state.value = stateForLookup(_state.value, result, _state.value.targetWord, _state.value.selectionRanges, null, notice)
            if (result.definitions.isNotEmpty()) pendingEntry = null
        }

        private fun stateForLookup(
            base: CardCreationState,
            result: LookupResult,
            target: String,
            ranges: List<SelectionRange>,
            alternative: LookupAlternative?,
            notice: CardCreationError? = null,
        ): CardCreationState {
            val (definitions, selected) = restorePending(result)
            val deck = (base.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck
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
                            confirmedExample = if (selected != null) base.context else null,
                            exampleConfirmed = selected != null,
                            notice = notice,
                        )
                }
            val isValidTargetRange = SelectionRanges.matchesTarget(base.context, ranges, target)
            return base.copy(
                targetWord = target,
                kind = result.kind,
                expressionContextFound = result.expressionContextFound,
                flowState = flow,
                lookupContext = base.lookupContext ?: base.context,
                selectionRanges = ranges,
                targetRanges = ranges.takeIf { isValidTargetRange }.orEmpty(),
                alternatives = result.alternatives,
                displayedAlternative = alternative,
                includeSuggestions = if (alternative == null) base.includeSuggestions else false,
                alternativeLookupStatus = AlternativeLookupStatus.Idle,
            )
        }

        private fun restorePending(result: LookupResult): Pair<List<DefinitionResult>, DefinitionResult?> {
            val pending = pendingEntry ?: return result.definitions to null
            val chosen = result.definitions.firstOrNull { it.id == pending.pendingDefinitionId } ?: return result.definitions to null
            val forms: Map<String, String>? =
                pending.pendingInflectionForms?.let {
                    Gson().fromJson(it, object : TypeToken<Map<String, String>>() {}.type)
                }
            val restored =
                chosen.copy(
                    lookupId = pending.pendingLookupId,
                    inflectionForms = forms ?: chosen.inflectionForms,
                    queuedRetry = true,
                )
            return result.definitions.map { if (it.id == restored.id) restored else it } to restored
        }

        private fun handleLookupFailure(error: Throwable) {
            if (error is UnauthorizedException) {
                _unauthorizedEvent.tryEmit(Unit)
                return
            }
            if (error is VocabularyNotFoundException) {
                _state.value = _state.value.copy(flowState = CardCreationFlowState.ManualDefinition())
                return
            }
            val reason =
                when (error) {
                    is ExpressionTooLongException -> CardCreationError.EXPRESSION_TOO_LONG
                    is LookupInputInvalidException -> CardCreationError.LOOKUP_INPUT_INVALID
                    is ContextTooLongException -> CardCreationError.CONTEXT_TOO_LONG
                    else -> error.toCardCreationError(CardCreationError.LOOKUP_FAILED)
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
                            lemma = _state.value.targetWord,
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
            if (definition.queuedRetry && definition.lookupId != null) return DefinitionState.Available
            val deckIds = definition.decks.map { it.id }
            return when {
                deck != null && deck.id in deckIds -> DefinitionState.AlreadyInSelectedDeck
                deckIds.isNotEmpty() -> DefinitionState.ExistsInAnotherDeck
                else -> DefinitionState.Available
            }
        }

        fun createCard() {
            if (createCardJob?.isActive == true) return

            val current = _state.value
            val currentFlowState = current.flowState as? CardCreationFlowState.DefinitionsLoaded ?: return
            val selectedDefinition = currentFlowState.selectedDefinition ?: return
            val selectedDeck = (current.deckSelectionState as? DeckSelectionState.Loaded)?.selectedDeck ?: return
            val draftContext = current.context
            if (!current.contextValid) return

            if (currentFlowState.definitionState == DefinitionState.AlreadyInSelectedDeck) return
            if (!currentFlowState.exampleConfirmed) return

            val confirmedExample = currentFlowState.confirmedExample
            val savedContext = confirmedExample ?: draftContext
            val safeTargetRanges = targetRangesForSave(current, savedContext)
            lookupJob?.cancel()
            createCardJob =
                appScope.launch {
                    _state.value =
                        current.copy(
                            flowState = CardCreationFlowState.CreatingCard,
                            alternativeLookupStatus = AlternativeLookupStatus.Idle,
                        )
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
                            targetRanges = safeTargetRanges,
                        ).fold(
                            onSuccess = { cardId ->
                                _state.value = _state.value.copy(flowState = CardCreationFlowState.CardCreated())
                                _cardCreatedEvent.tryEmit(
                                    CardCreatedEvent(
                                        cardId,
                                        resolvedDefinition.definition,
                                        selectedDeck,
                                        safeTargetRanges,
                                        savedContext,
                                        current.targetWord,
                                    ),
                                )
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

        private fun targetRangesForSave(
            current: CardCreationState,
            context: String?,
        ): List<SelectionRange> = current.targetRanges.takeIf { SelectionRanges.matchesTarget(context, it, current.targetWord) }.orEmpty()

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
                else ->
                    _state.value =
                        _state.value.copy(flowState = flow.copy(notice = error.toCardCreationError(CardCreationError.CREATE_CARD_FAILED)))
            }
        }

        private suspend fun resolveDraftDefinition(
            definition: DefinitionResult,
            flow: CardCreationFlowState.DefinitionsLoaded,
        ): DefinitionResult? {
            if (definition.id.isNotEmpty()) return definition
            val result =
                vocabularyRepository.createUserDefinition(
                    text = _state.value.targetWord,
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
                        else ->
                            _state.value =
                                _state.value.copy(
                                    flowState = flow.copy(notice = error.toCardCreationError(CardCreationError.MANUAL_DEFINITION_FAILED)),
                                )
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
            val flowState = _state.value.flowState
            if (flowState is CardCreationFlowState.LookupError && !flowState.type.canRetryLookup) return
            if (lookupJob?.isActive == true) return
            lookupVocabulary()
        }

        fun dismissError() {
            if (_state.value.flowState is CardCreationFlowState.CreateCardError) {
                lookupVocabulary()
            }
        }
    }

private fun Throwable.toCardCreationError(unexpectedFallback: CardCreationError): CardCreationError =
    toKnownCardCreationError() ?: remoteFailureKind().toCardCreationError(unexpectedFallback)

private fun Throwable.toKnownCardCreationError(): CardCreationError? =
    when (this) {
        is StaleReferenceException -> CardCreationError.STALE_REFERENCE
        is CardAlreadyExistsException -> CardCreationError.CREATE_CARD_FAILED
        is DefinitionAlreadyExistsException -> CardCreationError.DEFINITION_ALREADY_EXISTS
        is ExpressionTooLongException -> CardCreationError.EXPRESSION_TOO_LONG
        is LookupInputInvalidException -> CardCreationError.LOOKUP_INPUT_INVALID
        is ContextTooLongException -> CardCreationError.CONTEXT_TOO_LONG
        else -> null
    }

private fun RemoteFailureKind.toCardCreationError(unexpectedFallback: CardCreationError): CardCreationError =
    when (this) {
        RemoteFailureKind.CONNECTION -> CardCreationError.CONNECTION
        RemoteFailureKind.RATE_LIMITED -> CardCreationError.RATE_LIMITED
        RemoteFailureKind.SERVICE_UNAVAILABLE -> CardCreationError.SERVICE_UNAVAILABLE
        RemoteFailureKind.BAD_REQUEST -> CardCreationError.REQUEST_REJECTED
        RemoteFailureKind.FORBIDDEN -> CardCreationError.FORBIDDEN
        RemoteFailureKind.NOT_FOUND -> CardCreationError.NOT_FOUND
        RemoteFailureKind.CONFLICT -> CardCreationError.CONFLICT
        RemoteFailureKind.UNEXPECTED -> unexpectedFallback
    }
