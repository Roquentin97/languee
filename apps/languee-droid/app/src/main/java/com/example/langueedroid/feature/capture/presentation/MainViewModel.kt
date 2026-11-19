package com.example.langueedroid.feature.capture.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.ExportStatusNotifier
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionSpanSelector
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
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
data class LookupSelection(
    val context: String,
    val ranges: List<SelectionRange>,
    val captureContext: String? = context,
    val sourceOffsetCodePoints: Int = 0,
)

private data class PreparedEntry(
    val context: String?,
    val language: String,
    val selection: LookupSelection?,
)

data class CardCreationRequest(
    val targetWord: String,
    val context: String?,
    val language: String = "en",
    val sessionId: Int = 0,
    val selection: LookupSelection? = null,
)

sealed class AnkiStatusNotification {
    object AnkiDroidInstalled : AnkiStatusNotification()

    object AnkiDroidUninstalled : AnkiStatusNotification()

    object PermissionGranted : AnkiStatusNotification()

    object PermissionRevoked : AnkiStatusNotification()
}

@HiltViewModel
class MainViewModel
    @Inject
    constructor(
        private val ankiDroidExportService: AnkiDroidExportService,
        private val ankiDroidPreferencesStore: AnkiDroidPreferencesStore,
        private val offlineStateManager: OfflineStateManager,
        private val offlineQueueRepository: OfflineQueueRepository,
        private val vocabularyRepository: VocabularyRepository,
        exportStatusNotifier: ExportStatusNotifier,
    ) : ViewModel() {
        private val _state = MutableStateFlow<AppState>(AppState.Screen.Decks)
        val state: StateFlow<AppState> = _state.asStateFlow()

        /** True when the device has no network or the backend is unreachable. */
        val isOffline: StateFlow<Boolean> = offlineStateManager.isOffline

        /** Number of captures waiting in the local offline queue. */
        val offlineQueueCount: StateFlow<Int> =
            offlineQueueRepository
                .count()
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

        /** Emitted when a capture was stored in the offline queue instead of card creation. */
        private val _offlineWordSaved = MutableSharedFlow<Int>(extraBufferCapacity = 1)
        val offlineWordSaved: SharedFlow<Int> = _offlineWordSaved.asSharedFlow()

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
        private var workspace: AppState.Screen.SharedContextCapture? = null
        private var lookupSelection: LookupSelection? = null
        private var statusJob: Job? = null
        private var sessionGeneration = 0
        private val completedOperations = mutableSetOf<Pair<String, String>>()
        val sessionId: Int get() = sessionGeneration
        private var offlineQueued = false
        private var pendingOfflineEntry: Pair<String, PreparedEntry>? = null
        private val _offlineQueueError = MutableStateFlow(false)
        val offlineQueueError = _offlineQueueError.asStateFlow()
        private val _offlineQueueRetryAvailable = MutableStateFlow(false)
        val offlineQueueRetryAvailable = _offlineQueueRetryAvailable.asStateFlow()
        val exportFailures = exportStatusNotifier.failures
        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent = _unauthorizedEvent.asSharedFlow()
        var preferredDeckId: String? = null
            private set
        var fromExternalShare: Boolean = false
            private set

        fun captureCompleted(
            definition: String,
            deck: Deck,
            cardId: String? = null,
            targetRanges: List<SelectionRange> = emptyList(),
            capturedContext: String? = null,
            targetWord: String? = null,
        ): Boolean {
            val current = workspace ?: return false
            val operation = cardId?.let { it to deck.id }
            if (operation != null && operation in completedOperations) return true
            val sourceRanges = targetRangesInCaptureContext(targetRanges, capturedContext, targetWord, current)
            val capturedIndices = tokenIndicesForRanges(current.tokens, sourceRanges).ifEmpty { current.selectedIndices }
            if (capturedIndices.isEmpty()) return false
            if (current.completed.any { completed -> completed.indices.any { it in capturedIndices } }) return false
            preferredDeckId = deck.id
            if (operation != null) completedOperations.add(operation)
            val updated =
                current.copy(
                    selectedIndices = emptyList(),
                    completed = current.completed + CompletedTarget(capturedIndices, definition, deck.name),
                )
            workspace = updated
            _state.value = updated
            loadSavedVocabulary()
            return true
        }

        fun returnToCapture(): Boolean {
            val current = workspace ?: return false
            _state.value = current
            return true
        }

        fun startManualAdd(
            prefilledWord: String = "",
            deckId: String? = null,
        ) {
            fromExternalShare = fromExternalShare && _state.value is AppState.Screen.SharedWordCapture && prefilledWord.isNotBlank()
            sessionGeneration++
            completedOperations.clear()
            offlineQueued = false
            workspace = null
            lookupSelection = null
            preferredDeckId = deckId
            _state.value = AppState.Screen.ManualCapture(prefilledWord = prefilledWord)
        }

        fun startTextInput() {
            fromExternalShare = false
            sessionGeneration++
            completedOperations.clear()
            offlineQueued = false
            workspace = null
            lookupSelection = null
            preferredDeckId = null
            _state.value = AppState.Screen.TextInput
        }

        fun startTextWorkspace(text: String) {
            if (text.isBlank() || !EntryValidator.validateCaptureText(text).isValid) return
            lookupSelection = null
            fromExternalShare = false
            sessionGeneration++
            completedOperations.clear()
            offlineQueued = false
            val current =
                AppState.Screen.SharedContextCapture(
                    tokens = EntryValidator.splitIntoTokens(text),
                    rawContext = text,
                )
            workspace = current
            preferredDeckId = null
            _state.value = current
            loadSavedVocabulary()
        }

        /**
         * Called when a word and optional context are ready to proceed to card creation.
         * Emits a [CardCreationRequest] event for the UI to handle navigation.
         */
        fun addEntry(
            word: String,
            context: String?,
        ) {
            val trimmedWord = word.trim()
            if (trimmedWord.isEmpty()) return
            val prepared = prepareEntry(trimmedWord, context) ?: return
            if (isOffline.value) {
                queueOfflineEntry(trimmedWord, prepared)
                return
            }
            _cardCreationRequest.tryEmit(
                CardCreationRequest(trimmedWord, prepared.context, prepared.language, sessionGeneration, prepared.selection),
            )
        }

        private fun prepareEntry(
            word: String,
            context: String?,
        ): PreparedEntry? {
            val review = _state.value as? AppState.Screen.ContextReview
            if (review != null && SelectionRanges.matchesTarget(review.context, review.selectionRanges, review.targetWord)) {
                lookupSelection =
                    LookupSelection(
                        context = review.context,
                        ranges = review.selectionRanges,
                        captureContext = review.captureContext,
                        sourceOffsetCodePoints = review.sourceOffsetCodePoints,
                    )
            }
            val normalizedContext =
                context
                    ?.let { value ->
                        if (lookupSelection?.context == value) value else value.trim()
                    }?.ifBlank { null }
            if (!EntryValidator.isContextWithinLimit(normalizedContext)) return null
            val selection =
                lookupSelection?.takeIf { selected ->
                    selected.context == normalizedContext &&
                        SelectionRanges.matchesTarget(selected.context, selected.ranges, word) &&
                        SelectionRanges.matchesTarget(normalizedContext, selected.ranges, word)
                }
            if (selection == null) lookupSelection = null
            return PreparedEntry(normalizedContext, currentSelectedLanguage(), selection)
        }

        private fun queueOfflineEntry(
            word: String,
            prepared: PreparedEntry,
        ) {
            if (offlineQueued) return
            offlineQueued = true
            val generation = sessionGeneration
            viewModelScope.launch {
                try {
                    offlineQueueRepository.add(
                        word,
                        prepared.context,
                        lookupContext = prepared.selection?.context,
                        selectionStart =
                            prepared.selection
                                ?.ranges
                                ?.singleOrNull()
                                ?.start,
                        selectionEnd =
                            prepared.selection
                                ?.ranges
                                ?.singleOrNull()
                                ?.end,
                        language = prepared.language,
                        selectionRanges = prepared.selection?.ranges,
                        targetRanges =
                            prepared.selection?.ranges?.takeIf {
                                SelectionRanges.matchesTarget(prepared.context, it, word)
                            },
                    )
                    if (generation == sessionGeneration) {
                        pendingOfflineEntry = null
                        _offlineQueueRetryAvailable.value = false
                    }
                    _offlineWordSaved.tryEmit(generation)
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    if (generation == sessionGeneration) {
                        offlineQueued = false
                        pendingOfflineEntry = word to prepared
                        _offlineQueueRetryAvailable.value = true
                        _offlineQueueError.value = true
                    }
                }
            }
        }

        private var lastPendingSaveKey: String? = null

        fun queueFailedSave(
            word: String,
            context: String?,
            language: String,
            definition: com.example.langueedroid.core.domain.DefinitionResult,
            deck: Deck,
            entryId: String? = null,
            selection: LookupSelection? = null,
            lookupContext: String? = null,
            targetRanges: List<SelectionRange>? = null,
            includeSuggestions: Boolean = true,
        ) {
            val key = listOf(sessionGeneration, entryId, definition.id, definition.lookupId, deck.id).joinToString(":")
            if (lastPendingSaveKey == key) return
            lastPendingSaveKey = key
            val generation = sessionGeneration
            viewModelScope.launch {
                try {
                    offlineQueueRepository.addPendingSave(
                        word,
                        context,
                        language,
                        definition.id,
                        definition.lookupId,
                        deck.id,
                        definition.inflectionForms,
                        entryId,
                        selection?.context ?: lookupContext,
                        selection?.ranges?.singleOrNull()?.start,
                        selection?.ranges?.singleOrNull()?.end,
                        selectionRanges = selection?.ranges,
                        targetRanges = targetRanges?.takeIf { SelectionRanges.matchesTarget(context, it, word) },
                        includeSuggestions = includeSuggestions,
                    )
                    _offlineWordSaved.tryEmit(generation)
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    if (generation == sessionGeneration) {
                        lastPendingSaveKey = null
                        _offlineQueueRetryAvailable.value = false
                        _offlineQueueError.value = true
                    }
                }
            }
        }

        /** Called when the user picks a language chip (EN/ES/DE) on a capture screen. */
        fun selectLanguage(code: String) {
            _state.value =
                when (val current = _state.value) {
                    is AppState.Screen.ManualCapture -> current.copy(selectedLanguage = code)
                    is AppState.Screen.SharedWordCapture -> current.copy(selectedLanguage = code)
                    is AppState.Screen.SharedContextCapture -> current.copy(selectedLanguage = code)
                    is AppState.Screen.ContextReview -> current.copy(selectedLanguage = code)
                    else -> current
                }
            (_state.value as? AppState.Screen.SharedContextCapture)?.let { workspace = it }
        }

        /** Reads the language selected on whichever capture screen is currently displayed. */
        private fun currentSelectedLanguage(): String =
            when (val current = _state.value) {
                is AppState.Screen.ManualCapture -> current.selectedLanguage
                is AppState.Screen.SharedWordCapture -> current.selectedLanguage
                is AppState.Screen.SharedContextCapture -> current.selectedLanguage
                is AppState.Screen.ContextReview -> current.selectedLanguage
                is AppState.Screen.ContextEdit -> current.selectedLanguage
                else -> "en"
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
            fromExternalShare = true
            sessionGeneration++
            completedOperations.clear()
            offlineQueued = false
            workspace = null
            lookupSelection = null
            preferredDeckId = null
            val trimmed = sharedText.trim()
            if (trimmed.isBlank()) {
                _state.value = AppState.Screen.ManualCapture()
                return
            }

            if (!EntryValidator.validateCaptureText(sharedText).isValid) {
                _state.value = AppState.Screen.SharedTextPreview(sharedText)
            } else if (EntryValidator.isLikelySingleWord(trimmed)) {
                val cleanWord = trimmed.trimStart { !it.isLetter() }.trimEnd { !it.isLetter() }
                val wordToUse = cleanWord.ifEmpty { trimmed }
                _state.value = AppState.Screen.SharedWordCapture(word = wordToUse)
            } else {
                val tokens = EntryValidator.splitIntoTokens(sharedText)
                val current = AppState.Screen.SharedContextCapture(tokens = tokens, rawContext = sharedText)
                workspace = current
                _state.value = current
                loadSavedVocabulary()
            }
        }

        /**
         * Called when the user taps a word token in the SharedContextCapture screen.
         * Tapping a word not yet selected starts or extends the selection (up to 6 words);
         * tapping a selected word deselects just that word, allowing a discontiguous
         * selection. See [ExpressionSpanSelector] for the exact rules.
         */
        fun onWordTokenTapped(index: Int) {
            val current = _state.value as? AppState.Screen.SharedContextCapture ?: return
            if (current.completed.any { index in it.indices }) {
                _state.value = current.copy(inspectedIndex = index).also { workspace = it }
                return
            }
            lookupSelection = null
            val updatedSelection =
                ExpressionSpanSelector.onWordTapped(
                    tokens = current.tokens,
                    currentSelection = current.selectedIndices,
                    tappedIndex = index,
                )
            _state.value = current.copy(selectedIndices = updatedSelection, inspectedIndex = index).also { workspace = it }
        }

        fun clearWordSelection() {
            val current = _state.value as? AppState.Screen.SharedContextCapture ?: return
            lookupSelection = null
            _state.value = current.copy(selectedIndices = emptyList()).also { workspace = it }
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
            val ranges = SelectionRanges.fromTokenIndices(current.tokens, current.selectedIndices)
            val highlights = ranges.mapNotNull { SelectionRanges.toUtf16Range(context, it) }
            val sentenceCount = EntryValidator.countSentences(context)
            _state.value =
                AppState.Screen.ContextReview(
                    targetWord = targetWord,
                    context = context,
                    isMultiSentence = sentenceCount > 1,
                    highlightRanges = highlights,
                    selectionRanges = ranges,
                    captureContext = current.rawContext,
                    sourceOffsetCodePoints = 0,
                    selectedLanguage = current.selectedLanguage,
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
            val bounds = sentenceBounds(current.context, current.selectionRanges)
            val sentence =
                bounds?.let { current.context.substring(it.first, it.second) }
                    ?: EntryValidator.extractSentenceContaining(current.targetWord, current.context)
            if (sentence == null) {
                _state.value = current.copy(isMultiSentence = false)
                return
            }
            val sourceStart = bounds?.first ?: current.context.indexOf(sentence).coerceAtLeast(0)
            val prefixCodePoints = current.context.codePointCount(0, sourceStart)
            val rebased =
                current.selectionRanges
                    .mapNotNull { range ->
                        val utf16 = SelectionRanges.toUtf16Range(current.context, range) ?: return@mapNotNull null
                        val sentenceEnd = sourceStart + sentence.length
                        if (utf16.first < sourceStart || utf16.last >= sentenceEnd) return@mapNotNull null
                        SelectionRange(range.start - prefixCodePoints, range.end - prefixCodePoints)
                    }.takeIf { it.size == current.selectionRanges.size }
                    .orEmpty()
            val highlights =
                if (rebased.isNotEmpty()) {
                    rebased.mapNotNull { SelectionRanges.toUtf16Range(sentence, it) }
                } else {
                    EntryValidator.findStandaloneMatches(current.targetWord, sentence)
                }
            _state.value =
                current.copy(
                    context = sentence,
                    isMultiSentence = false,
                    highlightRanges = highlights,
                    selectionRanges = rebased,
                    captureContext = current.captureContext ?: workspace?.rawContext ?: current.context,
                    sourceOffsetCodePoints = current.sourceOffsetCodePoints + prefixCodePoints,
                )
        }

        /** Called from ContextReview when the user chooses to keep the full context as-is. */
        fun keepFullContext() {
            val current = _state.value as? AppState.Screen.ContextReview ?: return
            _state.value = current.copy(isMultiSentence = false)
        }

        /** Cancel any active capture flow and return to the decks screen. */
        fun dismissCapture() {
            fromExternalShare = false
            sessionGeneration++
            completedOperations.clear()
            statusJob?.cancel()
            workspace = null
            lookupSelection = null
            preferredDeckId = null
            _state.value = AppState.Screen.Decks
        }

        fun retrySavedVocabulary() {
            loadSavedVocabulary()
        }

        private fun loadSavedVocabulary() {
            statusJob?.cancel()
            val generation = sessionGeneration
            val current = workspace ?: return
            updateWorkspaceStatus(current.savedVocabulary, SavedVocabularyStatus.Loading)
            statusJob =
                viewModelScope.launch {
                    vocabularyRepository.savedMatches(current.rawContext, current.selectedLanguage).fold(
                        onSuccess = { saved ->
                            if (generation ==
                                sessionGeneration
                            ) {
                                updateWorkspaceStatus(saved, SavedVocabularyStatus.Available)
                            }
                        },
                        onFailure = { error ->
                            if (generation == sessionGeneration) {
                                if (error is UnauthorizedException) {
                                    _unauthorizedEvent.tryEmit(Unit)
                                } else {
                                    updateWorkspaceStatus(emptyList(), SavedVocabularyStatus.Unavailable)
                                }
                            }
                        },
                    )
                }
        }

        fun dismissOfflineQueueError() {
            _offlineQueueError.value = false
            _offlineQueueRetryAvailable.value = false
        }

        fun retryOfflineQueueSave() {
            val pending = pendingOfflineEntry ?: return
            _offlineQueueError.value = false
            _offlineQueueRetryAvailable.value = false
            queueOfflineEntry(pending.first, pending.second)
        }

        private fun updateWorkspaceStatus(
            saved: List<com.example.langueedroid.core.data.SavedVocabulary>,
            status: SavedVocabularyStatus,
        ) {
            val current = workspace ?: return
            val updated = current.copy(savedVocabulary = saved, savedStatus = status)
            workspace = updated
            if (_state.value is AppState.Screen.SharedContextCapture) _state.value = updated
        }

        /** Navigate to the context edit screen for an existing targetWord and context. */
        fun startContextEdit(
            targetWord: String,
            context: String,
        ) {
            val review = _state.value as? AppState.Screen.ContextReview
            lookupSelection = null
            val ranges =
                if (review != null && SelectionRanges.matchesTarget(review.context, review.selectionRanges, targetWord)) {
                    review.selectionRanges
                } else {
                    emptyList()
                }
            val highlightRanges =
                ranges
                    .mapNotNull { SelectionRanges.toUtf16Range(context, it) }
                    .ifEmpty {
                        if (ranges.isEmpty()) EntryValidator.findStandaloneMatches(targetWord, context) else emptyList()
                    }
            _state.value =
                AppState.Screen.ContextEdit(
                    targetWord = targetWord,
                    context = context,
                    highlightRanges = highlightRanges,
                    selectionRanges = ranges,
                    captureContext = review?.captureContext,
                    sourceOffsetCodePoints = review?.sourceOffsetCodePoints ?: 0,
                    selectedLanguage = currentSelectedLanguage(),
                )
        }

        /**
         * Called when the user saves the edited context.
         * - blank context → EmptyContextPendingConfirmation (ask for confirmation)
         * - non-blank context containing targetWord → Valid (opens card creation)
         * - non-blank context missing targetWord → InvalidContextBlockedSave (blocked)
         * targetWord is read from the current ContextEdit state.
         */
        fun onContextEditSave(editedContext: String): ContextEditSaveResult {
            val current = _state.value as? AppState.Screen.ContextEdit ?: return ContextEditSaveResult.Valid
            val targetWord = current.targetWord
            return if (editedContext.isBlank()) {
                ContextEditSaveResult.EmptyContextPendingConfirmation
            } else if (!EntryValidator.isContextWithinLimit(editedContext)) {
                ContextEditSaveResult.ContextTooLong
            } else if (SelectionRanges.matchesTarget(editedContext, current.selectionRanges, targetWord) ||
                EntryValidator.isContextValid(targetWord, editedContext)
            ) {
                lookupSelection =
                    if (SelectionRanges.matchesTarget(editedContext, current.selectionRanges, targetWord)) {
                        LookupSelection(
                            context = editedContext,
                            ranges = current.selectionRanges,
                            captureContext = current.captureContext.takeIf { editedContext == current.context },
                            sourceOffsetCodePoints = current.sourceOffsetCodePoints.takeIf { editedContext == current.context } ?: 0,
                        )
                    } else {
                        null
                    }
                addEntry(targetWord, editedContext)
                ContextEditSaveResult.Valid
            } else {
                ContextEditSaveResult.InvalidContextBlockedSave(targetWord)
            }
        }

        /** Continue without context after the empty-context confirmation. */
        fun confirmSaveWithoutContext(targetWord: String) {
            lookupSelection = null
            addEntry(targetWord, null)
        }

        private fun sentenceBounds(
            context: String,
            ranges: List<SelectionRange>,
        ): Pair<Int, Int>? {
            val offsets = ranges.map { SelectionRanges.toUtf16Range(context, it) ?: return null }
            val first = offsets.firstOrNull()?.first ?: return null
            val start = context.lastIndexOfAny(charArrayOf('.', '!', '?'), first - 1) + 1
            val punctuation = context.indexOfAny(charArrayOf('.', '!', '?'), offsets.first().last + 1)
            val end = if (punctuation < 0) context.length else punctuation + 1
            if (offsets.any { it.first < start || it.last + 1 > end }) return null
            val segment = context.substring(start, end)
            val leading = segment.indexOfFirst { !it.isWhitespace() }.takeIf { it >= 0 } ?: return null
            val trailing = segment.indexOfLast { !it.isWhitespace() }.takeIf { it >= 0 } ?: return null
            return (start + leading) to (start + trailing + 1)
        }

        private fun tokenIndicesForRanges(
            tokens: List<com.example.langueedroid.core.domain.Token>,
            ranges: List<SelectionRange>,
        ): List<Int> {
            if (ranges.isEmpty()) return emptyList()
            val indices =
                ranges.mapNotNull { requested ->
                    tokens.indices.firstOrNull { index ->
                        SelectionRanges.fromTokenIndices(tokens, listOf(index)).singleOrNull() == requested
                    }
                }
            return indices.takeIf { it.size == ranges.size }.orEmpty()
        }

        private fun targetRangesInCaptureContext(
            ranges: List<SelectionRange>,
            context: String?,
            target: String?,
            current: AppState.Screen.SharedContextCapture,
        ): List<SelectionRange> {
            val selection = lookupSelection ?: return emptyList()
            val source = selection.captureContext ?: return emptyList()
            if (source != current.rawContext || context != selection.context || target == null) return emptyList()
            if (!SelectionRanges.matchesTarget(context, ranges, target)) return emptyList()
            val codePointCount = source.codePointCount(0, source.length)
            if (selection.sourceOffsetCodePoints > codePointCount) return emptyList()
            val sourceStart = source.offsetByCodePoints(0, selection.sourceOffsetCodePoints)
            val sourceEnd = sourceStart + selection.context.length
            if (sourceEnd > source.length || source.substring(sourceStart, sourceEnd) != selection.context) return emptyList()
            return ranges.map { range ->
                SelectionRange(
                    start = range.start + selection.sourceOffsetCodePoints,
                    end = range.end + selection.sourceOffsetCodePoints,
                )
            }
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
