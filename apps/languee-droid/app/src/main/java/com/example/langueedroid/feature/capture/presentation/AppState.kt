package com.example.langueedroid.feature.capture.presentation

import com.example.langueedroid.core.data.SavedVocabulary
import com.example.langueedroid.core.domain.Token

sealed class AppState {
    sealed class Screen : AppState() {
        /** The deck list screen showing all user decks. */
        object Decks : Screen()

        object TextInput : Screen()

        /** Editable validation preview for oversized or over-complex shared text. */
        data class SharedTextPreview(
            val text: String,
        ) : Screen()

        /**
         * Manual capture: two text fields (target word, optional context).
         * [prefilledWord] carries a word pre-populated from a single-word share intent.
         */
        data class ManualCapture(
            val prefilledWord: String = "",
            val selectedLanguage: String = "en",
        ) : Screen()

        /** Shared single-word target awaiting card editor navigation. */
        data class SharedWordCapture(
            val word: String,
            val selectedLanguage: String = "en",
        ) : Screen()

        /**
         * Shared context capture: the app received multi-token text via the share intent.
         * The user taps a word to start a selection, taps adjacent words to extend it into
         * a multi-word expression (1–6 words), and taps selected words to deselect them —
         * the selection may be discontiguous so words that are not part of the expression
         * (e.g. the object of a separated phrasal verb) can be dropped. [selectedIndices]
         * holds the ordered word-token indices currently selected
         * (see [com.example.langueedroid.core.domain.ExpressionSpanSelector]).
         */
        data class SharedContextCapture(
            val tokens: kotlin.collections.List<Token>,
            val rawContext: String,
            val selectedIndices: kotlin.collections.List<Int> = emptyList(),
            val selectedLanguage: String = "en",
            val completed: kotlin.collections.List<CompletedTarget> = emptyList(),
            val savedVocabulary: kotlin.collections.List<SavedVocabulary> = emptyList(),
            val savedStatus: SavedVocabularyStatus = SavedVocabularyStatus.Loading,
            val inspectedIndex: Int? = null,
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
            val selectedLanguage: String = "en",
            val selection: IntRange? = null,
        ) : Screen()

        /**
         * Context edit: the user edits the context for a given target word.
         * Highlight ranges mark standalone occurrences of the target word in the context.
         * [selectedLanguage] carries the language chosen earlier in the flow through to
         * card creation; this screen has no language UI of its own.
         */
        data class ContextEdit(
            val targetWord: String,
            val context: String,
            val highlightRanges: kotlin.collections.List<IntRange>,
            val selectedLanguage: String = "en",
        ) : Screen()
    }
}

sealed class SavedVocabularyStatus {
    object Loading : SavedVocabularyStatus()

    object Available : SavedVocabularyStatus()

    object Unavailable : SavedVocabularyStatus()
}

data class CompletedTarget(
    val indices: List<Int>,
    val definition: String,
    val deckName: String,
)
