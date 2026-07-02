package com.example.langueedroid.core.domain

/**
 * Builds a contiguous multi-word selection (1–6 words) from a tapped-token interaction over
 * a [Token] list, for capturing idioms and phrasal verbs from shared text.
 *
 * Selection is tracked as an ordered list of indices into the original [Token] list, always
 * referring to [Token.Word] entries. Tapping a word extends the selection when the tapped
 * word is immediately adjacent (in word order, ignoring separators) to either edge of the
 * current selection; tapping an edge word again shrinks the selection; tapping anywhere else
 * restarts the selection at the tapped word.
 */
object ExpressionSpanSelector {

    const val MAX_SPAN_WORDS = 6

    /**
     * Returns the updated selection after the user taps the word token at [tappedIndex].
     * [tappedIndex] must reference a [Token.Word] in [tokens].
     */
    fun onWordTapped(
        tokens: List<Token>,
        currentSelection: List<Int>,
        tappedIndex: Int,
    ): List<Int> {
        require(tokens.getOrNull(tappedIndex) is Token.Word) {
            "tappedIndex must reference a Token.Word"
        }

        if (currentSelection.isEmpty()) return listOf(tappedIndex)

        val first = currentSelection.first()
        val last = currentSelection.last()

        return when {
            tappedIndex == first && tappedIndex == last -> emptyList()
            tappedIndex == first -> currentSelection - tappedIndex
            tappedIndex == last -> currentSelection - tappedIndex
            tappedIndex in currentSelection -> listOf(tappedIndex)
            tappedIndex == nextWordIndex(tokens, last) ->
                if (currentSelection.size >= MAX_SPAN_WORDS) currentSelection else currentSelection + tappedIndex
            tappedIndex == previousWordIndex(tokens, first) ->
                if (currentSelection.size >= MAX_SPAN_WORDS) currentSelection else listOf(tappedIndex) + currentSelection
            else -> listOf(tappedIndex)
        }
    }

    /** Joins the selected word tokens, in order, with single spaces to form the target text. */
    fun joinSelection(tokens: List<Token>, selection: List<Int>): String =
        selection.mapNotNull { (tokens.getOrNull(it) as? Token.Word)?.text }.joinToString(" ")

    private fun nextWordIndex(tokens: List<Token>, fromIndex: Int): Int? {
        for (i in fromIndex + 1 until tokens.size) {
            if (tokens[i] is Token.Word) return i
        }
        return null
    }

    private fun previousWordIndex(tokens: List<Token>, fromIndex: Int): Int? {
        for (i in fromIndex - 1 downTo 0) {
            if (tokens[i] is Token.Word) return i
        }
        return null
    }
}
