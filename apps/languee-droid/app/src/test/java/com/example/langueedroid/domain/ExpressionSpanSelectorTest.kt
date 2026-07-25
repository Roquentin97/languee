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
    fun `tapping an inner word of a three-word selection deselects just that word`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        val aIndex = 6
        var selection = ExpressionSpanSelector.onWordTapped(tokens, emptyList(), ranIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, aIndex)

        val discontiguous = ExpressionSpanSelector.onWordTapped(tokens, selection, intoIndex)
        assertEquals(listOf(ranIndex, aIndex), discontiguous)
    }

    @Test
    fun `tapping an unselected word between the edges re-adds it in word order`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val intoIndex = 4
        val aIndex = 6
        val discontiguous = listOf(ranIndex, aIndex)

        val readded = ExpressionSpanSelector.onWordTapped(tokens, discontiguous, intoIndex)
        assertEquals(listOf(ranIndex, intoIndex, aIndex), readded)
    }

    @Test
    fun `a discontiguous selection still extends at its edges`() {
        val tokens = tokensOf("I ran into a friend")
        val ranIndex = 2
        val aIndex = 6
        val friendIndex = 8
        val discontiguous = listOf(ranIndex, aIndex)

        val extended = ExpressionSpanSelector.onWordTapped(tokens, discontiguous, friendIndex)
        assertEquals(listOf(ranIndex, aIndex, friendIndex), extended)
    }

    @Test
    fun `tapping a non-adjacent word outside a discontiguous selection restarts it`() {
        val tokens = tokensOf("He looked the long word up very quickly")
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }
        val lookedIndex = wordIndices[1]
        val upIndex = wordIndices[5]
        val quicklyIndex = wordIndices[7]
        val discontiguous = listOf(lookedIndex, upIndex)

        val restarted = ExpressionSpanSelector.onWordTapped(tokens, discontiguous, quicklyIndex)
        assertEquals(listOf(quicklyIndex), restarted)
    }

    // -------------------------------------------------------------------------
    // onWordTapped — word cap
    // -------------------------------------------------------------------------

    private val max = ExpressionSpanSelector.MAX_SPAN_WORDS

    /**
     * A sentence with comfortably more words than the cap allows. Alphabetic only — the
     * tokenizer splits on non-letters, so "w1" would not be a single word token.
     */
    private fun cappedTokens(): List<Token> =
        tokensOf(('a'..'z').take(max + 2).joinToString(" ") { "$it$it" })

    @Test
    fun `selection cannot grow beyond the word cap`() {
        val tokens = cappedTokens()
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }

        var selection = emptyList<Int>()
        for (index in wordIndices.take(max + 1)) {
            selection = ExpressionSpanSelector.onWordTapped(tokens, selection, index)
        }

        assertEquals(max, selection.size)
        assertEquals(wordIndices.take(max), selection)
    }

    @Test
    fun `re-adding a gap word is refused when the selection is already at the cap`() {
        val tokens = cappedTokens()
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }

        var selection = emptyList<Int>()
        for (index in wordIndices.take(max)) {
            selection = ExpressionSpanSelector.onWordTapped(tokens, selection, index)
        }
        // drop word 3 (gap), then extend the right edge -> back at the cap, with a gap
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, wordIndices[2])
        selection = ExpressionSpanSelector.onWordTapped(tokens, selection, wordIndices[max])
        assertEquals(max, selection.size)

        val unchanged = ExpressionSpanSelector.onWordTapped(tokens, selection, wordIndices[2])
        assertEquals(selection, unchanged)
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
    fun `joinSelection joins a discontiguous selection skipping deselected words`() {
        val tokens = tokensOf("He looked the word up")
        val wordIndices = tokens.withIndex()
            .filter { it.value is Token.Word }
            .map { it.index }
        val lookedIndex = wordIndices[1]
        val upIndex = wordIndices[4]
        assertEquals("looked up", ExpressionSpanSelector.joinSelection(tokens, listOf(lookedIndex, upIndex)))
    }

    @Test
    fun `joinSelection returns empty string for empty selection`() {
        val tokens = tokensOf("I ran into a friend")
        assertEquals("", ExpressionSpanSelector.joinSelection(tokens, emptyList()))
    }
}
