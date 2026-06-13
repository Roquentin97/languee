package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.langueedroid.domain.EntryValidator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainViewModel(
    private val onEntryReadyForCardCreation: (word: String, context: String?) -> Unit,
) : ViewModel() {

    private val _state = MutableStateFlow<AppState>(AppState.Screen.Decks)
    val state: StateFlow<AppState> = _state.asStateFlow()

    /** Navigate to the manual add screen with no pre-filled word. */
    fun startManualAdd() {
        _state.value = AppState.Screen.ManualCapture()
    }

    /**
     * Called when a word and optional context are ready to proceed to card creation.
     * Delegates to the provided callback and navigates to the CardCreation screen.
     */
    fun addEntry(word: String, context: String?) {
        val trimmedWord = word.trim()
        if (trimmedWord.isEmpty()) return
        val normalizedContext = context?.trim()?.ifBlank { null }
        onEntryReadyForCardCreation(trimmedWord, normalizedContext)
        _state.value = AppState.Screen.CardCreation(targetWord = trimmedWord, context = normalizedContext)
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

    /** Cancel any active capture flow and return to the decks screen. */
    fun dismissCapture() {
        _state.value = AppState.Screen.Decks
    }

    /** Navigate to the context edit screen for an existing targetWord and context. */
    fun startContextEdit(targetWord: String, context: String) {
        val highlightRanges = EntryValidator.findStandaloneMatches(targetWord, context)
        _state.value = AppState.Screen.ContextEdit(
            targetWord = targetWord,
            context = context,
            highlightRanges = highlightRanges,
        )
    }

    /**
     * Called when the user saves the edited context.
     * - blank context → EmptyContextPendingConfirmation (ask for confirmation)
     * - non-blank context containing targetWord → Valid (triggers card creation, returns to decks)
     * - non-blank context missing targetWord → InvalidContextBlockedSave (blocked)
     * targetWord is read from the current ContextEdit state.
     */
    fun onContextEditSave(editedContext: String): ContextEditSaveResult {
        val current = _state.value as? AppState.Screen.ContextEdit ?: return ContextEditSaveResult.Valid
        val targetWord = current.targetWord
        return if (editedContext.isBlank()) {
            ContextEditSaveResult.EmptyContextPendingConfirmation
        } else if (EntryValidator.isContextValid(targetWord, editedContext)) {
            addEntry(targetWord, editedContext)
            ContextEditSaveResult.Valid
        } else {
            ContextEditSaveResult.InvalidContextBlockedSave(targetWord)
        }
    }

    /** Save entry without context after user confirms the empty-context dialog. */
    fun confirmSaveWithoutContext(targetWord: String) {
        addEntry(targetWord, null)
    }

    class Factory(
        private val onEntryReadyForCardCreation: (word: String, context: String?) -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            MainViewModel(onEntryReadyForCardCreation = onEntryReadyForCardCreation) as T
    }
}
