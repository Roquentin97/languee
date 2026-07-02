package com.example.langueedroid.feature.capture.presentation

import com.example.langueedroid.core.domain.Token

sealed class AppState {
    sealed class Screen : AppState() {

        /** The deck list screen showing all user decks. */
        object Decks : Screen()

        /**
         * Manual capture: two text fields (target word, optional context).
         * [prefilledWord] carries a word pre-populated from a single-word share intent.
         */
        data class ManualCapture(
            val prefilledWord: String = "",
        ) : Screen()

        /**
         * Shared single-word capture: the app received one word via the share intent.
         * Offers: add context manually, save without context, cancel.
         */
        data class SharedWordCapture(
            val word: String,
        ) : Screen()

        /**
         * Shared context capture: the app received multi-token text via the share intent.
         * The user taps a word to start a selection, then taps adjacent words to extend it
         * into a multi-word expression (1–6 words). [selectedIndices] holds the ordered,
         * contiguous word-token indices currently selected (see [com.example.langueedroid.core.domain.ExpressionSpanSelector]).
         */
        data class SharedContextCapture(
            val tokens: kotlin.collections.List<Token>,
            val rawContext: String,
            val selectedIndices: kotlin.collections.List<Int> = emptyList(),
        ) : Screen()

        /**
         * Context review: the user has selected a word; confirm before card creation.
         * If [isMultiSentence] is true, offer truncation.
         */
        data class ContextReview(
            val targetWord: String,
            val context: String,
            val isMultiSentence: Boolean,
            val highlightRanges: kotlin.collections.List<IntRange>,
        ) : Screen()

        /**
         * Context edit: the user edits the context for a given target word.
         * Highlight ranges mark standalone occurrences of the target word in the context.
         */
        data class ContextEdit(
            val targetWord: String,
            val context: String,
            val highlightRanges: kotlin.collections.List<IntRange>,
        ) : Screen()

    }
}
