package com.example.langueedroid.domain

import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionRangesTest {
    @Test
    fun `token ranges use Unicode code points for separated components`() {
        val context = "😀 turn it off"
        val tokens = EntryValidator.splitIntoTokens(context)
        val indices = tokens.withIndex().filter { it.value is com.example.langueedroid.core.domain.Token.Word }.map { it.index }

        val ranges = SelectionRanges.fromTokenIndices(tokens, listOf(indices[0], indices[2]))

        assertEquals(listOf(SelectionRange(2, 6), SelectionRange(10, 13)), ranges)
        assertEquals(true, SelectionRanges.matchesTarget(context, ranges, "turn off"))
        assertEquals(3 until 7, SelectionRanges.toUtf16Range(context, ranges.first()))
    }

    @Test
    fun `edited context that moves selected words invalidates old code point offsets`() {
        val ranges = listOf(SelectionRange(7, 11), SelectionRange(15, 18))

        assertTrue(SelectionRanges.matchesTarget("Please turn it off", ranges, "turn off"))
        assertFalse(SelectionRanges.matchesTarget("Now please turn it off", ranges, "turn off"))
    }
}
