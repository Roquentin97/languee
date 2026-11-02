package com.example.langueedroid.core.domain

/**
 * Describes whether a definition can be added to the currently selected deck.
 *
 * - [Available]: the definition is not yet in the selected deck — create is enabled.
 * - [AlreadyInSelectedDeck]: the definition already belongs to the selected deck — create is disabled.
 * - [ExistsInAnotherDeck]: the definition exists in a different deck — warn the user but allow creation.
 */
sealed class DefinitionState {
    object Available : DefinitionState()

    object AlreadyInSelectedDeck : DefinitionState()

    object ExistsInAnotherDeck : DefinitionState()
}
