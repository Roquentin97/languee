package com.example.langueedroid.feature.cardcreation.presentation

import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import org.junit.Assert.assertEquals
import org.junit.Test

class DefinitionGroupsTest {
    private fun definition(
        id: String,
        vararg decks: String,
    ) = DefinitionResult(id, "noun", id, null, "dictionary", decks.map { DeckRef(it, it) })

    @Test
    fun selectedDeckIsPrioritizedAndLookupOrderIsPreserved() {
        val new = definition("new")
        val other = definition("other", "other-deck")
        val first = definition("first", "target")
        val second = definition("second", "target", "other-deck")
        assertEquals(
            listOf(first, second) to listOf(new, other),
            groupDefinitionsByDeck(listOf(new, first, other, second), "target"),
        )
        assertEquals(
            listOf(other, first, second) to listOf(new),
            groupDefinitionsByDeck(listOf(new, other, first, second), null),
        )
        assertEquals(emptyList<DefinitionResult>() to listOf(new, other), groupDefinitionsByDeck(listOf(new, other), "target"))
        assertEquals(listOf(first, second) to emptyList<DefinitionResult>(), groupDefinitionsByDeck(listOf(first, second), "target"))
    }
}
