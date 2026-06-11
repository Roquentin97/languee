package com.example.langueedroid.presentation

import com.example.langueedroid.domain.Token
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MainViewModelTest {

    private lateinit var viewModel: MainViewModel

    @Before
    fun setUp() {
        viewModel = MainViewModel()
    }

    private val currentState get() = viewModel.state.value

    // -------------------------------------------------------------------------
    // Initial state
    // -------------------------------------------------------------------------

    @Test
    fun `initial state is Screen List with empty entries`() {
        val state = currentState
        assertTrue(state is AppState.Screen.List)
        assertTrue((state as AppState.Screen.List).entries.isEmpty())
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
    fun `dismissCapture returns to Screen List`() {
        viewModel.startManualAdd()
        viewModel.dismissCapture()
        assertTrue(currentState is AppState.Screen.List)
    }

    @Test
    fun `dismissCapture preserves existing entries in list`() {
        viewModel.addEntry("cat", "I have a cat")
        viewModel.startManualAdd()
        viewModel.dismissCapture()
        val list = currentState as AppState.Screen.List
        assertEquals(1, list.entries.size)
    }

    // -------------------------------------------------------------------------
    // addEntry
    // -------------------------------------------------------------------------

    @Test
    fun `addEntry with valid word navigates to List and stores entry`() {
        viewModel.addEntry("cat", "I have a cat")
        val state = currentState as AppState.Screen.List
        assertEquals(1, state.entries.size)
        assertEquals("cat", state.entries[0].targetWord)
        assertEquals("I have a cat", state.entries[0].context)
    }

    @Test
    fun `addEntry trims word`() {
        viewModel.addEntry("  cat  ", null)
        val state = currentState as AppState.Screen.List
        assertEquals("cat", state.entries[0].targetWord)
    }

    @Test
    fun `addEntry ignores blank word`() {
        viewModel.addEntry("   ", null)
        val state = currentState as AppState.Screen.List
        assertTrue(state.entries.isEmpty())
    }

    @Test
    fun `addEntry converts blank context to null`() {
        viewModel.addEntry("cat", "   ")
        val state = currentState as AppState.Screen.List
        assertNull(state.entries[0].context)
    }

    @Test
    fun `addEntry accumulates multiple entries`() {
        viewModel.addEntry("cat", null)
        viewModel.addEntry("dog", "I love dogs")
        val state = currentState as AppState.Screen.List
        assertEquals(2, state.entries.size)
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
        // Inject a ContextReview state where the targetWord does not appear in the context.
        // This exercises the null branch of confirmTruncation (extractSentenceContaining returns null).
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
        // Context unchanged
        assertEquals("I love cats. Dogs are great too.", state.context)
    }

    @Test
    fun `keepFullContext does nothing when state is not ContextReview`() {
        viewModel.startManualAdd()
        viewModel.keepFullContext()
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }
}
