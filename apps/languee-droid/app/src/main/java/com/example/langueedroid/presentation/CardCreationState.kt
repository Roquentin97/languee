package com.example.langueedroid.presentation

import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.DefinitionState

sealed class AnkiExportTriggerStatus {
    object NotTriggered : AnkiExportTriggerStatus()
    object InProgress : AnkiExportTriggerStatus()
    object Success : AnkiExportTriggerStatus()
    data class Failed(val message: String) : AnkiExportTriggerStatus()
}

/**
 * Represents the full state of the card creation screen.
 *
 * [targetWord] and [context] are the input values from the capture flow.
 * [deckSelectionState] tracks the deck list loading phase.
 * [flowState] tracks what step in the creation flow the user is on.
 */
data class CardCreationState(
    val targetWord: String,
    val context: String?,
    val deckSelectionState: DeckSelectionState = DeckSelectionState.Loading,
    val flowState: CardCreationFlowState = CardCreationFlowState.SelectingDeck,
)

sealed class DeckSelectionState {
    object Loading : DeckSelectionState()
    data class Loaded(val decks: List<Deck>, val selectedDeck: Deck?) : DeckSelectionState()
    object Empty : DeckSelectionState()
    data class Error(val message: String) : DeckSelectionState()
}

sealed class CardCreationFlowState {
    /** User has not yet selected a deck (or no decks exist). */
    object SelectingDeck : CardCreationFlowState()

    /** Vocabulary lookup is in progress. */
    object LookingUp : CardCreationFlowState()

    /** Definitions are loaded and displayed. */
    data class DefinitionsLoaded(
        val definitions: List<DefinitionResult>,
        val selectedDefinition: DefinitionResult?,
        val definitionState: DefinitionState?,
        val lemma: String,
        val confirmedExample: String? = null,
    ) : CardCreationFlowState()

    /** User is choosing which example sentence to include on the card. */
    data class SelectingExample(
        val definitions: List<DefinitionResult>,
        val lemma: String,
        val selectedDefinition: DefinitionResult,
        val definitionState: DefinitionState,
    ) : CardCreationFlowState()

    /** No definitions were returned for the given word. */
    data class NoDefinitions(val lemma: String) : CardCreationFlowState()

    /** Lookup failed with an error message. */
    data class LookupError(val message: String) : CardCreationFlowState()

    /** Card creation is in progress. */
    object CreatingCard : CardCreationFlowState()

    /** Card was created successfully. */
    data class CardCreated(
        val ankiExportStatus: AnkiExportTriggerStatus = AnkiExportTriggerStatus.NotTriggered,
    ) : CardCreationFlowState()

    /** Card creation failed with an error message. */
    data class CreateCardError(val message: String) : CardCreationFlowState()
}
