package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.domain.Token
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.CardCreationRequest
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult
import com.example.langueedroid.feature.capture.presentation.MainViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock


@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModelTest {

    private lateinit var viewModel: MainViewModel
    private lateinit var ankiDroidExportService: AnkiDroidExportService
    private lateinit var ankiDroidPreferencesStore: AnkiDroidPreferencesStore

    @Before
    fun setUp() {
        ankiDroidExportService = mock()
        ankiDroidPreferencesStore = mock()
        viewModel = MainViewModel(ankiDroidExportService, ankiDroidPreferencesStore)
    }

    private val currentState get() = viewModel.state.value

    // -------------------------------------------------------------------------
    // Initial state
    // -------------------------------------------------------------------------

    @Test
    fun `initial state is Screen Decks`() {
        assertTrue(currentState is AppState.Screen.Decks)
    }

    // -------------------------------------------------------------------------
    // startManualAdd
    // -------------------------------------------------------------------------

    @Test
    fun `startManualAdd navigates to ManualCapture with empty prefill`() {
        viewModel.startManualAdd()
        val state = currentState
        assertTrue(state is AppState.Screen.ManualCapture)
        assertEquals("", (state as AppState.Screen.ManualCapture).prefilledWord)
    }

    // -------------------------------------------------------------------------
    // dismissCapture
    // -------------------------------------------------------------------------

    @Test
    fun `dismissCapture returns to Screen Decks`() {
        viewModel.startManualAdd()
        viewModel.dismissCapture()
        assertTrue(currentState is AppState.Screen.Decks)
    }

    // -------------------------------------------------------------------------
    // addEntry
    // -------------------------------------------------------------------------

    @Test
    fun `addEntry with valid word emits CardCreationRequest`() = runTest {
        var received: CardCreationRequest? = null
        val job = launch { received = viewModel.cardCreationRequest.first() }

        viewModel.addEntry("cat", "I have a cat")
        job.join()

        assertEquals("cat", received?.targetWord)
        assertEquals("I have a cat", received?.context)
    }

    @Test
    fun `addEntry trims word`() = runTest {
        var received: CardCreationRequest? = null
        val job = launch { received = viewModel.cardCreationRequest.first() }

        viewModel.addEntry("  cat  ", null)
        job.join()

        assertEquals("cat", received?.targetWord)
    }

    @Test
    fun `addEntry ignores blank word`() {
        viewModel.addEntry("   ", null)
        // State should not change (still Decks from initial)
        assertTrue(currentState is AppState.Screen.Decks)
    }

    @Test
    fun `addEntry converts blank context to null`() = runTest {
        var received: CardCreationRequest? = null
        val job = launch { received = viewModel.cardCreationRequest.first() }

        viewModel.addEntry("cat", "   ")
        job.join()

        assertNull(received?.context)
    }

    // -------------------------------------------------------------------------
    // startSharedTextCapture
    // -------------------------------------------------------------------------

    @Test
    fun `startSharedTextCapture with blank text navigates to ManualCapture`() {
        viewModel.startSharedTextCapture("   ")
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }

    @Test
    fun `startSharedTextCapture with empty string navigates to ManualCapture`() {
        viewModel.startSharedTextCapture("")
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }

    @Test
    fun `startSharedTextCapture with single word navigates to SharedWordCapture`() {
        viewModel.startSharedTextCapture("hello")
        val state = currentState
        assertTrue(state is AppState.Screen.SharedWordCapture)
        assertEquals("hello", (state as AppState.Screen.SharedWordCapture).word)
    }

    @Test
    fun `startSharedTextCapture strips trailing punctuation from single word`() {
        viewModel.startSharedTextCapture("hello,")
        val state = currentState as AppState.Screen.SharedWordCapture
        assertEquals("hello", state.word)
    }

    @Test
    fun `startSharedTextCapture with multi-word text navigates to SharedContextCapture`() {
        viewModel.startSharedTextCapture("Hello world")
        val state = currentState
        assertTrue(state is AppState.Screen.SharedContextCapture)
    }

    @Test
    fun `startSharedTextCapture SharedContextCapture contains tokenised words`() {
        viewModel.startSharedTextCapture("Hello world")
        val state = currentState as AppState.Screen.SharedContextCapture
        val words = state.tokens.filterIsInstance<Token.Word>()
        assertEquals(2, words.size)
    }

    // -------------------------------------------------------------------------
    // selectTargetWord
    // -------------------------------------------------------------------------

    @Test
    fun `selectTargetWord navigates to ContextReview`() {
        viewModel.startSharedTextCapture("I love cats")
        viewModel.selectTargetWord("cats")
        assertTrue(currentState is AppState.Screen.ContextReview)
    }

    @Test
    fun `selectTargetWord sets targetWord and context`() {
        viewModel.startSharedTextCapture("I love cats")
        viewModel.selectTargetWord("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertEquals("cats", state.targetWord)
        assertEquals("I love cats", state.context)
    }

    @Test
    fun `selectTargetWord sets isMultiSentence false for single sentence`() {
        viewModel.startSharedTextCapture("I love cats")
        viewModel.selectTargetWord("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertFalse(state.isMultiSentence)
    }

    @Test
    fun `selectTargetWord sets isMultiSentence true for multi-sentence context`() {
        viewModel.startSharedTextCapture("I love cats. Dogs are great too.")
        viewModel.selectTargetWord("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertTrue(state.isMultiSentence)
    }

    @Test
    fun `selectTargetWord does nothing when state is not SharedContextCapture`() {
        viewModel.startManualAdd()
        viewModel.selectTargetWord("cats")
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }

    // -------------------------------------------------------------------------
    // confirmTruncation
    // -------------------------------------------------------------------------

    @Test
    fun `confirmTruncation truncates context to sentence containing word`() {
        viewModel.startSharedTextCapture("I love cats. Dogs are great too.")
        viewModel.selectTargetWord("cats")
        viewModel.confirmTruncation()
        val state = currentState as AppState.Screen.ContextReview
        assertTrue(state.context.contains("cats", ignoreCase = true))
        assertFalse(state.isMultiSentence)
    }

    @Test
    fun `confirmTruncation when sentence cannot be found disables multi-sentence flag and keeps context`() {
        val injectedState = AppState.Screen.ContextReview(
            targetWord = "missing",
            context = "First sentence. Second sentence.",
            isMultiSentence = true,
            highlightRanges = emptyList(),
        )
        @Suppress("UNCHECKED_CAST")
        val stateField = MainViewModel::class.java.getDeclaredField("_state")
        stateField.isAccessible = true
        val stateFlow = stateField.get(viewModel) as MutableStateFlow<AppState>
        stateFlow.value = injectedState

        viewModel.confirmTruncation()

        val state = currentState as AppState.Screen.ContextReview
        assertFalse(state.isMultiSentence)
        assertEquals("First sentence. Second sentence.", state.context)
    }

    // -------------------------------------------------------------------------
    // keepFullContext
    // -------------------------------------------------------------------------

    @Test
    fun `keepFullContext clears isMultiSentence flag`() {
        viewModel.startSharedTextCapture("I love cats. Dogs are great too.")
        viewModel.selectTargetWord("cats")
        viewModel.keepFullContext()
        val state = currentState as AppState.Screen.ContextReview
        assertFalse(state.isMultiSentence)
        assertEquals("I love cats. Dogs are great too.", state.context)
    }

    @Test
    fun `keepFullContext does nothing when state is not ContextReview`() {
        viewModel.startManualAdd()
        viewModel.keepFullContext()
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }

    // -------------------------------------------------------------------------
    // startContextEdit
    // -------------------------------------------------------------------------

    @Test
    fun `startContextEdit navigates to ContextEdit with given targetWord and context`() {
        viewModel.startContextEdit("cat", "I have a cat at home")
        val state = currentState
        assertTrue(state is AppState.Screen.ContextEdit)
        val editState = state as AppState.Screen.ContextEdit
        assertEquals("cat", editState.targetWord)
        assertEquals("I have a cat at home", editState.context)
    }

    @Test
    fun `startContextEdit computes highlight ranges for target word`() {
        viewModel.startContextEdit("cat", "I have a cat at home")
        val state = currentState as AppState.Screen.ContextEdit
        assertTrue(state.highlightRanges.isNotEmpty())
    }

    @Test
    fun `startContextEdit with empty highlight when word absent produces empty ranges`() {
        viewModel.startContextEdit("dog", "I have a cat at home")
        val state = currentState as AppState.Screen.ContextEdit
        assertTrue(state.highlightRanges.isEmpty())
    }

    // -------------------------------------------------------------------------
    // onContextEditSave — empty context → EmptyContextPendingConfirmation
    // -------------------------------------------------------------------------

    @Test
    fun `onContextEditSave with blank context returns EmptyContextPendingConfirmation`() {
        viewModel.startContextEdit("cat", "I have a cat")
        val result = viewModel.onContextEditSave("   ")
        assertTrue(result is ContextEditSaveResult.EmptyContextPendingConfirmation)
    }

    @Test
    fun `onContextEditSave blank context does not navigate away from ContextEdit`() {
        viewModel.startContextEdit("cat", "I have a cat")
        viewModel.onContextEditSave("   ")
        assertTrue(currentState is AppState.Screen.ContextEdit)
    }

    // -------------------------------------------------------------------------
    // onContextEditSave — valid context → Valid, emits CardCreationRequest
    // -------------------------------------------------------------------------

    @Test
    fun `onContextEditSave with valid context returns Valid`() {
        viewModel.startContextEdit("cat", "I have a cat")
        val result = viewModel.onContextEditSave("The cat sat on the mat")
        assertTrue(result is ContextEditSaveResult.Valid)
    }

    @Test
    fun `onContextEditSave with valid context emits CardCreationRequest`() = runTest {
        viewModel.startContextEdit("cat", "I have a cat")

        var received: CardCreationRequest? = null
        val job = launch { received = viewModel.cardCreationRequest.first() }

        viewModel.onContextEditSave("The cat sat on the mat")
        job.join()

        assertEquals("cat", received?.targetWord)
        assertEquals("The cat sat on the mat", received?.context)
    }

    @Test
    fun `onContextEditSave is case-insensitive for word matching`() {
        viewModel.startContextEdit("cat", "I have a cat")
        val result = viewModel.onContextEditSave("The Cat sat on the mat")
        assertTrue(result is ContextEditSaveResult.Valid)
    }

    @Test
    fun `onContextEditSave accepts word adjacent to punctuation`() {
        viewModel.startContextEdit("cat", "I have a cat")
        val result = viewModel.onContextEditSave("I love my cat.")
        assertTrue(result is ContextEditSaveResult.Valid)
    }

    // -------------------------------------------------------------------------
    // onContextEditSave — context missing word → InvalidContextBlockedSave
    // -------------------------------------------------------------------------

    @Test
    fun `onContextEditSave with non-empty context missing word returns InvalidContextBlockedSave`() {
        viewModel.startContextEdit("cat", "I have a cat")
        val result = viewModel.onContextEditSave("I have a dog at home")
        assertTrue(result is ContextEditSaveResult.InvalidContextBlockedSave)
        assertEquals("cat", (result as ContextEditSaveResult.InvalidContextBlockedSave).targetWord)
    }

    @Test
    fun `onContextEditSave blocked does not navigate away from ContextEdit`() {
        viewModel.startContextEdit("cat", "I have a cat")
        viewModel.onContextEditSave("I have a dog at home")
        assertTrue(currentState is AppState.Screen.ContextEdit)
    }

    // -------------------------------------------------------------------------
    // confirmSaveWithoutContext
    // -------------------------------------------------------------------------

    @Test
    fun `confirmSaveWithoutContext adds entry with null context and emits CardCreationRequest`() = runTest {
        viewModel.startContextEdit("cat", "I have a cat")

        var received: CardCreationRequest? = null
        val job = launch { received = viewModel.cardCreationRequest.first() }

        viewModel.confirmSaveWithoutContext("cat")
        job.join()

        assertEquals("cat", received?.targetWord)
        assertNull(received?.context)
    }

    @Test
    fun `dismissCapture from ContextEdit returns to Decks without saving`() {
        viewModel.startContextEdit("cat", "I have a cat")
        viewModel.dismissCapture()
        assertTrue(currentState is AppState.Screen.Decks)
    }
}
