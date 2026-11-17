package com.example.langueedroid.feature.cardcreation.presentation

import com.example.langueedroid.core.domain.DefinitionResult

/** Keep lookup order within each group; before deck selection, surface entries saved in any deck. */
internal fun groupDefinitionsByDeck(
    definitions: List<DefinitionResult>,
    selectedDeckId: String?,
): Pair<List<DefinitionResult>, List<DefinitionResult>> =
    definitions.partition { definition ->
        if (selectedDeckId == null) definition.decks.isNotEmpty() else definition.decks.any { it.id == selectedDeckId }
    }
