package com.example.langueedroid.core.domain

/**
 * Builds a multi-word selection (1–[ExpressionLimits.MAX_WORDS] words) from a tapped-token
 * interaction over a [Token]
 * list, for capturing idioms and phrasal verbs from shared text.
 *
 * Selection is tracked as an ordered list of indices into the original [Token] list. Every
 * word tap toggles that word independently, including words far from the current selection.
 */
object ExpressionSpanSelector {
    const val MAX_SPAN_WORDS = ExpressionLimits.MAX_WORDS

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

        return when {
            tappedIndex in currentSelection -> currentSelection - tappedIndex
            currentSelection.size < MAX_SPAN_WORDS ->
                (currentSelection + tappedIndex).sorted()
            else -> currentSelection
        }
    }

    /** Joins the selected word tokens, in order, with single spaces to form the target text. */
    fun joinSelection(
        tokens: List<Token>,
        selection: List<Int>,
    ): String = selection.mapNotNull { (tokens.getOrNull(it) as? Token.Word)?.text }.joinToString(" ")
}
