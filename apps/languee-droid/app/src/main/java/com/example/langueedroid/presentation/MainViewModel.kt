package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import com.example.langueedroid.domain.EntryValidator
import com.example.langueedroid.domain.VocabularyEntry
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainViewModel : ViewModel() {

    private val _state = MutableStateFlow<AppState>(AppState.Screen.List())
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val _entries = mutableListOf<VocabularyEntry>()

    /** Add an entry directly (word + optional context) and navigate back to the list. */
    fun addEntry(word: String, context: String?) {
        val trimmedWord = word.trim()
        if (trimmedWord.isEmpty()) return
        val normalizedContext = context?.trim()?.ifBlank { null }
        _entries.add(VocabularyEntry(targetWord = trimmedWord, context = normalizedContext))
        _state.value = AppState.Screen.List(entries = _entries.toList())
    }

    /** Navigate to the manual add screen with no pre-filled word. */
    fun startManualAdd() {
        _state.value = AppState.Screen.ManualCapture()
    }

    /**
     * Handle text received from a share intent.
     * - Blank/empty text → ManualCapture (no pre-fill).
     * - Single word (no whitespace after trimming non-letter chars) → SharedWordCapture.
     * - Multi-token text → SharedContextCapture with tokenised list.
     */
    fun startSharedTextCapture(sharedText: String) {
        val trimmed = sharedText.trim()
        if (trimmed.isBlank()) {
            _state.value = AppState.Screen.ManualCapture()
            return
        }

        if (EntryValidator.isLikelySingleWord(trimmed)) {
            // Strip leading/trailing non-letter characters (e.g. trailing punctuation).
            val cleanWord = trimmed.trimStart { !it.isLetter() }.trimEnd { !it.isLetter() }
            val wordToUse = cleanWord.ifEmpty { trimmed }
            _state.value = AppState.Screen.SharedWordCapture(word = wordToUse)
        } else {
            val tokens = EntryValidator.splitIntoTokens(trimmed)
            _state.value = AppState.Screen.SharedContextCapture(tokens = tokens, rawContext = trimmed)
        }
    }

    /**
     * Called when the user taps a word token in the SharedContextCapture screen.
     * Builds a ContextReview state with highlight ranges and multi-sentence flag.
     */
    fun selectTargetWord(token: String) {
        val current = _state.value as? AppState.Screen.SharedContextCapture ?: return
        val context = current.rawContext
        val highlights = EntryValidator.findStandaloneMatches(token, context)
        val sentenceCount = EntryValidator.countSentences(context)
        _state.value = AppState.Screen.ContextReview(
            targetWord = token,
            context = context,
            isMultiSentence = sentenceCount > 1,
            highlightRanges = highlights,
        )
    }

    /**
     * Called from ContextReview when the user chooses to truncate the context to the
     * sentence containing the target word.
     * If [extractSentenceContaining] returns null the truncation cannot be performed;
     * stay in ContextReview with updated context instead.
     */
    fun confirmTruncation() {
        val current = _state.value as? AppState.Screen.ContextReview ?: return
        val sentence = EntryValidator.extractSentenceContaining(current.targetWord, current.context)
        if (sentence == null) {
            // Cannot truncate; remove multi-sentence warning but keep current context.
            _state.value = current.copy(isMultiSentence = false)
            return
        }
        val highlights = EntryValidator.findStandaloneMatches(current.targetWord, sentence)
        _state.value = current.copy(
            context = sentence,
            isMultiSentence = false,
            highlightRanges = highlights,
        )
    }

    /** Called from ContextReview when the user chooses to keep the full context as-is. */
    fun keepFullContext() {
        val current = _state.value as? AppState.Screen.ContextReview ?: return
        _state.value = current.copy(isMultiSentence = false)
    }

    /** Cancel any active capture flow and return to the list. */
    fun dismissCapture() {
        _state.value = AppState.Screen.List(entries = _entries.toList())
    }
}
