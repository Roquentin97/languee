package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.domain.CardAlreadyExistsException
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.DefinitionState
import com.example.langueedroid.domain.StaleReferenceException
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CardCreationViewModel(
    private val targetWord: String,
    private val context: String?,
    private val deckRepository: DeckRepository,
    private val vocabularyRepository: VocabularyRepository,
    private val cardRepository: CardRepository,
    private val onUnauthorized: () -> Unit,
    private val onCardCreated: () -> Unit,
) : ViewModel() {

    private val _state = MutableStateFlow(
        CardCreationState(targetWord = targetWord, context = context),
    )
    val state: StateFlow<CardCreationState> = _state.asStateFlow()

    private var createCardJob: Job? = null

    init {
        loadDecks()
    }

    private fun loadDecks() {
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
                        onUnauthorized()
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
            else -> Unit
        }
    }

    private fun lookupVocabulary(deck: Deck) {
        viewModelScope.launch {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.LookingUp)
            vocabularyRepository.lookup(
                word = targetWord,
                language = deck.language,
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
                        onUnauthorized()
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
        _state.value = _state.value.copy(
            flowState = currentFlowState.copy(
                selectedDefinition = definition,
                definitionState = definitionState,
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

        createCardJob = viewModelScope.launch {
            _state.value = _state.value.copy(flowState = CardCreationFlowState.CreatingCard)
            cardRepository.createCard(
                deckId = selectedDeck.id,
                definitionId = selectedDefinition.id,
            ).fold(
                onSuccess = {
                    _state.value = _state.value.copy(flowState = CardCreationFlowState.CardCreated)
                    onCardCreated()
                },
                onFailure = { error ->
                    when (error) {
                        is UnauthorizedException -> onUnauthorized()
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

    class Factory(
        private val targetWord: String,
        private val context: String?,
        private val deckRepository: DeckRepository,
        private val vocabularyRepository: VocabularyRepository,
        private val cardRepository: CardRepository,
        private val onUnauthorized: () -> Unit,
        private val onCardCreated: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CardCreationViewModel(
                targetWord = targetWord,
                context = context,
                deckRepository = deckRepository,
                vocabularyRepository = vocabularyRepository,
                cardRepository = cardRepository,
                onUnauthorized = onUnauthorized,
                onCardCreated = onCardCreated,
            ) as T
    }
}
