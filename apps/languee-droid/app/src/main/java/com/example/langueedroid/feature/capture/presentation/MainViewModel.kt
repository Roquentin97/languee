package com.example.langueedroid.feature.capture.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionSpanSelector
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One-shot navigation event emitted when the capture flow produces a word ready for card creation. */
data class CardCreationRequest(val targetWord: String, val context: String?)

sealed class AnkiStatusNotification {
    object AnkiDroidInstalled : AnkiStatusNotification()
    object AnkiDroidUninstalled : AnkiStatusNotification()
    object PermissionGranted : AnkiStatusNotification()
    object PermissionRevoked : AnkiStatusNotification()
}

@HiltViewModel
class MainViewModel @Inject constructor(
    private val ankiDroidExportService: AnkiDroidExportService,
    private val ankiDroidPreferencesStore: AnkiDroidPreferencesStore,
    private val offlineStateManager: OfflineStateManager,
    private val offlineQueueRepository: OfflineQueueRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<AppState>(AppState.Screen.Decks)
    val state: StateFlow<AppState> = _state.asStateFlow()

    /** True when the device has no network or the backend is unreachable. */
    val isOffline: StateFlow<Boolean> = offlineStateManager.isOffline

    /** Number of captures waiting in the local offline queue. */
    val offlineQueueCount: StateFlow<Int> = offlineQueueRepository.count()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    /** Emitted when a capture was stored in the offline queue instead of card creation. */
    private val _offlineWordSaved = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val offlineWordSaved: SharedFlow<Unit> = _offlineWordSaved.asSharedFlow()

    /** Emitted when the capture flow has a word ready; the UI navigates to card creation. */
    private val _cardCreationRequest = MutableSharedFlow<CardCreationRequest>(extraBufferCapacity = 1)
    val cardCreationRequest: SharedFlow<CardCreationRequest> = _cardCreationRequest.asSharedFlow()

    /** Emitted when the capture flow should navigate to AnkiDroid setup. */
    private val _navigateToAnkiSetup = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val navigateToAnkiSetup: SharedFlow<Unit> = _navigateToAnkiSetup.asSharedFlow()

    /** Emitted when the capture flow should navigate to AnkiDroid sync. */
    private val _navigateToAnkiSync = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val navigateToAnkiSync: SharedFlow<Unit> = _navigateToAnkiSync.asSharedFlow()

    // --- AnkiDroid status monitoring (TASK-6) ---
    private val _ankiStatusNotification = MutableStateFlow<AnkiStatusNotification?>(null)
    val ankiStatusNotification: StateFlow<AnkiStatusNotification?> = _ankiStatusNotification.asStateFlow()

    private var previousAnkiResult: AnkiDroidSetupCheckResult? = null

    /** Navigate to the manual add screen with no pre-filled word. */
    fun startManualAdd() {
        _state.value = AppState.Screen.ManualCapture()
    }

    /**
     * Called when a word and optional context are ready to proceed to card creation.
     * Emits a [CardCreationRequest] event for the UI to handle navigation.
     */
    fun addEntry(word: String, context: String?) {
        val trimmedWord = word.trim()
        if (trimmedWord.isEmpty()) return
        val normalizedContext = context?.trim()?.ifBlank { null }
        if (isOffline.value) {
            viewModelScope.launch {
                offlineQueueRepository.add(trimmedWord, normalizedContext)
                _offlineWordSaved.tryEmit(Unit)
            }
            return
        }
        _cardCreationRequest.tryEmit(CardCreationRequest(trimmedWord, normalizedContext))
    }

    /** Remove a processed entry from the offline queue (after its card was created). */
    fun removeOfflineEntry(id: String) {
        viewModelScope.launch {
            offlineQueueRepository.remove(id)
        }
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
     * Tapping a word not yet selected starts or extends a contiguous selection (up to 6
     * words); tapping an edge of the current selection shrinks it. See
     * [ExpressionSpanSelector] for the exact rules.
     */
    fun onWordTokenTapped(index: Int) {
        val current = _state.value as? AppState.Screen.SharedContextCapture ?: return
        val updatedSelection = ExpressionSpanSelector.onWordTapped(
            tokens = current.tokens,
            currentSelection = current.selectedIndices,
            tappedIndex = index,
        )
        _state.value = current.copy(selectedIndices = updatedSelection)
    }

    /**
     * Called when the user confirms the current word selection in the SharedContextCapture
     * screen. Joins the selected words into the target expression and navigates to
     * ContextReview with highlight ranges and multi-sentence flag.
     */
    fun confirmWordSelection() {
        val current = _state.value as? AppState.Screen.SharedContextCapture ?: return
        if (current.selectedIndices.isEmpty()) return
        val targetWord = ExpressionSpanSelector.joinSelection(current.tokens, current.selectedIndices)
        val context = current.rawContext
        val highlights = EntryValidator.findStandaloneMatches(targetWord, context)
        val sentenceCount = EntryValidator.countSentences(context)
        _state.value = AppState.Screen.ContextReview(
            targetWord = targetWord,
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

    /** Request navigation to the AnkiDroid bulk sync screen. */
    fun goToAnkiDroidSync() {
        _navigateToAnkiSync.tryEmit(Unit)
    }

    /** Request navigation to the AnkiDroid integration settings screen. */
    fun goToAnkiDroidSetup() {
        _navigateToAnkiSetup.tryEmit(Unit)
    }

    // --- AnkiDroid status monitoring (TASK-6) ---

    /**
     * Called when the app resumes. Checks the AnkiDroid setup status and emits a
     * notification if the status changed since the last check.
     */
    fun onResumeCheckAnkiStatus() {
        viewModelScope.launch {
            val current = ankiDroidExportService.checkSetup(ankiDroidPreferencesStore)
            val prev = previousAnkiResult
            if (prev != null) {
                val notification = detectAnkiStatusChange(prev, current)
                if (notification != null) {
                    _ankiStatusNotification.value = notification
                }
            }
            previousAnkiResult = current
        }
    }

    /** Dismiss the current AnkiDroid status notification. */
    fun dismissAnkiStatusNotification() {
        _ankiStatusNotification.value = null
    }

    private fun detectAnkiStatusChange(
        previous: AnkiDroidSetupCheckResult,
        current: AnkiDroidSetupCheckResult,
    ): AnkiStatusNotification? {
        val prevNotInstalled = previous.issues.any { it is AnkiDroidSetupIssue.NotInstalled }
        val currNotInstalled = current.issues.any { it is AnkiDroidSetupIssue.NotInstalled }
        val prevPermDenied = previous.issues.any { it is AnkiDroidSetupIssue.PermissionDenied }
        val currPermDenied = current.issues.any { it is AnkiDroidSetupIssue.PermissionDenied }

        return when {
            prevNotInstalled && !currNotInstalled -> AnkiStatusNotification.AnkiDroidInstalled
            !prevNotInstalled && currNotInstalled -> AnkiStatusNotification.AnkiDroidUninstalled
            prevPermDenied && !currPermDenied -> AnkiStatusNotification.PermissionGranted
            !prevPermDenied && currPermDenied -> AnkiStatusNotification.PermissionRevoked
            else -> null
        }
    }
}
