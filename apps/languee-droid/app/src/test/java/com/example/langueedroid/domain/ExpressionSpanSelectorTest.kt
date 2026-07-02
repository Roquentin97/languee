package com.example.langueedroid.domain

import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionSpanSelector
import com.example.langueedroid.core.domain.Token
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ExpressionSpanSelectorTest {

    private fun tokensOf(text: String) = EntryValidator.splitIntoTokens(text)

    // -------------------------------------------------------------------------
    // onWordTapped — starting and extending a selection
    // -------------------------------------------------------------------------

    @Test
    fun `tapping a word with no current selection selects just that word`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2 // "I" " " "ran"
        val selection = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        assertEquals(listOf(ranIndex), selection)
    }

    @Test
    fun `tapping the word immediately after the selection extends it`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        val afterFirstTap = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        val afterSecondTap = ExpressionSpanSelector.onWordTapped(tokens, afterFirstTap, intoIndex)
        assertEquals(listOf(ranIndex, intoIndex), afterSecondTap)
    }

    @Test
    fun `tapping the word immediately before the selection extends it backward`() {
        val tokens = tokensOf("I ran into a friend")
        val iIndex = 0
        val ranIndex = 2
        val afterFirstTap = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        val afterSecondTap = ExpressionSpanSelector.onWordTapped(tokens, afterFirstTap, iIndex)
        assertEquals(listOf(iIndex, ranIndex), afterSecondTap)
    }

    @Test
    fun `tapping a non-adjacent word restarts the selection at that word`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val friendIndex = 8
        val afterFirstTap = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        val afterSecondTap = ExpressionSpanSelector.onWordTapped(tokens, afterFirstTap, friendIndex)
        assertEquals(listOf(friendIndex), afterSecondTap)
    }

    // -------------------------------------------------------------------------
    // onWordTapped — shrinking / deselecting
    // -------------------------------------------------------------------------

    @Test
    fun `tapping the only selected word again clears the selection`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val selected = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        val cleared = ExpressionSpanSelector.onWordTapped(tokens, selected, ranIndex)
        assertEquals(emptyList<Int>(), cleared)
    }

    @Test
    fun `tapping the trailing edge of a multi-word selection shrinks it`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        val aIndex = 6
        var selection = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, aIndex)
        assertEquals(listOf(ranIndex, intoIndex, aIndex), selection)

        val shrunk = ExpressionSpanSelector.onWordTapped(tokens, selection, aIndex)
        assertEquals(listOf(ranIndex, intoIndex), shrunk)
    }

    @Test
    fun `tapping the leading edge of a multi-word selection shrinks it`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        var selection = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)

        val shrunk = ExpressionSpanSelector.onWordTapped(tokens, selection, ranIndex)
        assertEquals(listOf(intoIndex), shrunk)
    }

    @Test
    fun `tapping an inner word of a three-word selection restarts the selection there`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        val aIndex = 6
        var selection = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, aIndex)

        val restarted = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)
        assertEquals(listOf(intoIndex), restarted)
    }

    // -------------------------------------------------------------------------
    // onWordTapped — 6-word cap
    // -------------------------------------------------------------------------

    @Test
    fun `selection cannot grow beyond six words`() {
        val tokens = tokensOf("one two three four five six seven eight")
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }

        var selection = emptyList<Int>()
        for (index in wordIndices.take(7)) {
            selection = ExpressionSpanSelector.onWordTapped(tokens, selection, index)
        }

        assertEquals(6, selection.size)
        assertEquals(wordIndices.take(6), selection)
    }

    @Test
    fun `tapping validation rejects an index that is not a Token Word`() {
        val tokens = tokensOf("I ran into a friend")
        val separatorIndex = 1 // the space after "I"
        assertThrows(IllegalArgumentException::class.java) {
            ExpressionSpanSelector.onWordTapped(tokens, emptyList(), separatorIndex)
        }
    }

    // -------------------------------------------------------------------------
    // joinSelection
    // -------------------------------------------------------------------------

    @Test
    fun `joinSelection joins a single selected word`() {
        val tokens = tokensOf("I ran into a friend")
        assertEquals("ran", ExpressionSpanSelector.joinSelection(tokens, listOf(2)))
    }

    @Test
    fun `joinSelection joins a contiguous multi-word selection with single spaces`() {
        val tokens = tokensOf("I ran into a friend")
        assertEquals("ran into", ExpressionSpanSelector.joinSelection(tokens, listOf(2, 4)))
    }

    @Test
    fun `joinSelection ignores original separator spacing`() {
        val tokens = tokensOf("I   ran    into a friend")
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }
        // ran, into are the 2nd and 3rd words
        assertEquals("ran into", ExpressionSpanSelector.joinSelection(tokens, listOf(wordIndices[1], wordIndices[2])))
    }

    @Test
    fun `joinSelection returns empty string for empty selection`() {
        val tokens = tokensOf("I ran into a friend")
        assertEquals("", ExpressionSpanSelector.joinSelection(tokens, emptyList()))
    }
}
