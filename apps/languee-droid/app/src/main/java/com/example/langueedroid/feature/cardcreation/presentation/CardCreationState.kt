package com.example.langueedroid.feature.cardcreation.presentation

import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.LexicalKind

enum class CardCreationError {
    LOAD_DECKS_FAILED,
    LOOKUP_FAILED,
    CREATE_CARD_FAILED,
    STALE_REFERENCE,
    EXPORT_RECORD_FAILED,
    EXPRESSION_TOO_LONG,
    LOOKUP_INPUT_INVALID,
    MANUAL_DEFINITION_FAILED,
    DEFINITION_ALREADY_EXISTS,
}

sealed class AnkiExportTriggerStatus {
    object NotTriggered : AnkiExportTriggerStatus()
    object InProgress : AnkiExportTriggerStatus()
    object Success : AnkiExportTriggerStatus()
    data class Failed(val type: CardCreationError) : AnkiExportTriggerStatus()
}

/**
 * Represents the full state of the card creation screen.
 *
 * [targetWord] and [context] are the input values from the capture flow.
 * [deckSelectionState] tracks the deck list loading phase.
 * [flowState] tracks what step in the creation flow the user is on.
 * [kind] and [expressionContextFound] are set once a lookup succeeds and persist across
 * flow-state transitions so the UI can show a kind chip and context warning consistently.
 */
data class CardCreationState(
    val targetWord: String,
    val context: String?,
    val language: String = "en",
    val deckSelectionState: DeckSelectionState = DeckSelectionState.Loading,
    val flowState: CardCreationFlowState = CardCreationFlowState.SelectingDeck,
    val kind: LexicalKind = LexicalKind.WORD,
    val expressionContextFound: Boolean? = null,
)

sealed class DeckSelectionState {
    object Loading : DeckSelectionState()
    data class Loaded(val decks: List<Deck>, val selectedDeck: Deck?) : DeckSelectionState()
    object Empty : DeckSelectionState()
    data class Error(val type: CardCreationError) : DeckSelectionState()
}

sealed class CardCreationFlowState {
    /** User has not yet selected a deck (or no decks exist). */
    object SelectingDeck : CardCreationFlowState()

    /** Vocabulary lookup is in progress. */
    object LookingUp : CardCreationFlowState()

    /**
     * Definitions are loaded and displayed.
     * [notice] carries a one-time informational banner, e.g. after a manual definition
     * submission turned out to already exist and the list was re-fetched.
     */
    data class DefinitionsLoaded(
        val definitions: List<DefinitionResult>,
        val selectedDefinition: DefinitionResult?,
        val definitionState: DefinitionState?,
        val lemma: String,
        val confirmedExample: String? = null,
        val notice: CardCreationError? = null,
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

    /**
     * The dictionary provider has no entry for the looked-up expression
     * (`meta.providerMiss == true` with an empty definitions list). Offers a form to
     * submit a user-provided definition instead of the usual [NoDefinitions] display.
     */
    data class ManualDefinition(
        val definitionText: String = "",
        val exampleText: String = "",
        val isSubmitting: Boolean = false,
        val error: CardCreationError? = null,
    ) : CardCreationFlowState()

    /** Lookup failed. */
    data class LookupError(val type: CardCreationError) : CardCreationFlowState()

    /** Card creation is in progress. */
    object CreatingCard : CardCreationFlowState()

    /** Card was created successfully. */
    data class CardCreated(
        val ankiExportStatus: AnkiExportTriggerStatus = AnkiExportTriggerStatus.NotTriggered,
    ) : CardCreationFlowState()

    /** Card creation failed. */
    data class CreateCardError(val type: CardCreationError) : CardCreationFlowState()
}
