package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.domain.Token
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.CardCreationRequest
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult
import com.example.langueedroid.feature.capture.presentation.MainViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock

import kotlinx.coroutines.flow.flowOf

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModelTest {

    private lateinit var viewModel: MainViewModel
    private lateinit var ankiDroidExportService: AnkiDroidExportService
    private lateinit var ankiDroidPreferencesStore: AnkiDroidPreferencesStore
    private lateinit var offlineStateManager: OfflineStateManager
    private lateinit var offlineQueueRepository: OfflineQueueRepository

    @Before
    fun setUp() {
        ankiDroidExportService = mock()
        ankiDroidPreferencesStore = mock()
        offlineStateManager = mock {
            on { isOffline } doReturn MutableStateFlow(false)
        }
        offlineQueueRepository = mock {
            on { count() } doReturn flowOf(0)
        }
        viewModel = MainViewModel(
            ankiDroidExportService,
            ankiDroidPreferencesStore,
            offlineStateManager,
            offlineQueueRepository,
        )
    }

    private val currentState get() = viewModel.state.value

    /** Taps the given words in order (by text, first unselected occurrence) and confirms the selection. */
    private fun selectWords(vararg words: String) {
        for (word in words) {
            val state = currentState as AppState.Screen.SharedContextCapture
            val index = state.tokens.withIndex().first { (idx, token) ->
                token is Token.Word && token.text == word && idx !in state.selectedIndices
            }.index
            viewModel.onWordTokenTapped(index)
        }
        viewModel.confirmWordSelection()
    }

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
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.addEntry("cat", "I have a cat")
        advanceUntilIdle()

        assertEquals("cat", received?.targetWord)
        assertEquals("I have a cat", received?.context)
    }

    @Test
    fun `addEntry trims word`() = runTest {
        var received: CardCreationRequest? = null
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.addEntry("  cat  ", null)
        advanceUntilIdle()

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
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.addEntry("cat", "   ")
        advanceUntilIdle()

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
    // onWordTokenTapped / confirmWordSelection — single word (unchanged behavior)
    // -------------------------------------------------------------------------

    @Test
    fun `selecting a single word and confirming navigates to ContextReview`() {
        viewModel.startSharedTextCapture("I love cats")
        selectWords("cats")
        assertTrue(currentState is AppState.Screen.ContextReview)
    }

    @Test
    fun `selecting a single word and confirming sets targetWord and context`() {
        viewModel.startSharedTextCapture("I love cats")
        selectWords("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertEquals("cats", state.targetWord)
        assertEquals("I love cats", state.context)
    }

    @Test
    fun `selecting a single word sets isMultiSentence false for single sentence`() {
        viewModel.startSharedTextCapture("I love cats")
        selectWords("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertFalse(state.isMultiSentence)
    }

    @Test
    fun `selecting a single word sets isMultiSentence true for multi-sentence context`() {
        viewModel.startSharedTextCapture("I love cats. Dogs are great too.")
        selectWords("cats")
        val state = currentState as AppState.Screen.ContextReview
        assertTrue(state.isMultiSentence)
    }

    @Test
    fun `onWordTokenTapped does nothing when state is not SharedContextCapture`() {
        viewModel.startManualAdd()
        viewModel.onWordTokenTapped(0)
        assertTrue(currentState is AppState.Screen.ManualCapture)
    }

    @Test
    fun `confirmWordSelection does nothing when no word is selected`() {
        viewModel.startSharedTextCapture("I love cats")
        viewModel.confirmWordSelection()
        assertTrue(currentState is AppState.Screen.SharedContextCapture)
    }

    // -------------------------------------------------------------------------
    // onWordTokenTapped / confirmWordSelection — multi-word expression span
    // -------------------------------------------------------------------------

    @Test
    fun `tapping two adjacent words extends the selection`() {
        viewModel.startSharedTextCapture("I ran into an old friend")
        selectWords("ran", "into")
        val state = currentState as AppState.Screen.ContextReview
        assertEquals("ran into", state.targetWord)
    }

    @Test
    fun `tapping words out of order still joins them in context order`() {
        viewModel.startSharedTextCapture("I ran into an old friend")
        // tap "into" first, then the adjacent-previous "ran" — selection should still
        // join in left-to-right context order via ExpressionSpanSelector.
        val state1 = currentState as AppState.Screen.SharedContextCapture
        val intoIndex = state1.tokens.indexOfFirst { it is Token.Word && it.text == "into" }
        viewModel.onWordTokenTapped(intoIndex)
        val state2 = currentState as AppState.Screen.SharedContextCapture
        val ranIndex = state2.tokens.indexOfFirst { it is Token.Word && it.text == "ran" }
        viewModel.onWordTokenTapped(ranIndex)
        viewModel.confirmWordSelection()

        val state = currentState as AppState.Screen.ContextReview
        assertEquals("ran into", state.targetWord)
    }

    @Test
    fun `deselecting interior words yields a discontiguous expression`() {
        viewModel.startSharedTextCapture("He looked the word up")
        val capture = currentState as AppState.Screen.SharedContextCapture
        fun indexOf(word: String) = capture.tokens.indexOfFirst { it is Token.Word && it.text == word }
        viewModel.onWordTokenTapped(indexOf("looked"))
        viewModel.onWordTokenTapped(indexOf("the"))
        viewModel.onWordTokenTapped(indexOf("word"))
        viewModel.onWordTokenTapped(indexOf("up"))
        viewModel.onWordTokenTapped(indexOf("the"))
        viewModel.onWordTokenTapped(indexOf("word"))
        viewModel.confirmWordSelection()

        val state = currentState as AppState.Screen.ContextReview
        assertEquals("looked up", state.targetWord)
    }

    @Test
    fun `selection is capped at six words`() {
        viewModel.startSharedTextCapture("one two three four five six seven eight")
        selectWords("one", "two", "three", "four", "five", "six", "seven")
        val state = currentState as AppState.Screen.ContextReview
        assertEquals("one two three four five six", state.targetWord)
    }

    @Test
    fun `expression selected from context is standalone valid — highlight ranges non-empty`() {
        viewModel.startSharedTextCapture("I ran into an old friend yesterday")
        selectWords("ran", "into")
        val state = currentState as AppState.Screen.ContextReview
        assertTrue(state.highlightRanges.isNotEmpty())
    }

    // -------------------------------------------------------------------------
    // confirmTruncation
    // -------------------------------------------------------------------------

    @Test
    fun `confirmTruncation truncates context to sentence containing word`() {
        viewModel.startSharedTextCapture("I love cats. Dogs are great too.")
        selectWords("cats")
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
        selectWords("cats")
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
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.onContextEditSave("The cat sat on the mat")
        advanceUntilIdle()

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
    // onContextEditSave — multi-word expression target
    // -------------------------------------------------------------------------

    @Test
    fun `onContextEditSave accepts a multi-word expression standalone in the context`() {
        viewModel.startContextEdit("run into", "I always run into her at the store")
        val result = viewModel.onContextEditSave("Yesterday I ran into her again, then I run into him too")
        assertTrue(result is ContextEditSaveResult.Valid)
    }

    @Test
    fun `onContextEditSave rejects a multi-word expression not standalone in the edited context`() {
        viewModel.startContextEdit("run into", "I always run into her at the store")
        val result = viewModel.onContextEditSave("I always bump into her at the store")
        assertTrue(result is ContextEditSaveResult.InvalidContextBlockedSave)
        assertEquals("run into", (result as ContextEditSaveResult.InvalidContextBlockedSave).targetWord)
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
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.confirmSaveWithoutContext("cat")
        advanceUntilIdle()

        assertEquals("cat", received?.targetWord)
        assertNull(received?.context)
    }

    @Test
    fun `dismissCapture from ContextEdit returns to Decks without saving`() {
        viewModel.startContextEdit("cat", "I have a cat")
        viewModel.dismissCapture()
        assertTrue(currentState is AppState.Screen.Decks)
    }

    // -------------------------------------------------------------------------
    // Language selection
    // -------------------------------------------------------------------------

    @Test
    fun `ManualCapture defaults selectedLanguage to en`() {
        viewModel.startManualAdd()
        val state = currentState as AppState.Screen.ManualCapture
        assertEquals("en", state.selectedLanguage)
    }

    @Test
    fun `selectLanguage updates ManualCapture selectedLanguage`() {
        viewModel.startManualAdd()
        viewModel.selectLanguage("es")
        val state = currentState as AppState.Screen.ManualCapture
        assertEquals("es", state.selectedLanguage)
    }

    @Test
    fun `selectLanguage updates SharedContextCapture selectedLanguage`() {
        viewModel.startSharedTextCapture("I ran into an old friend")
        viewModel.selectLanguage("de")
        val state = currentState as AppState.Screen.SharedContextCapture
        assertEquals("de", state.selectedLanguage)
    }

    @Test
    fun `selectLanguage does nothing when state is not a capture screen`() {
        viewModel.selectLanguage("es")
        assertTrue(currentState is AppState.Screen.Decks)
    }

    @Test
    fun `selected language persists from SharedContextCapture into ContextReview`() {
        viewModel.startSharedTextCapture("I ran into an old friend")
        viewModel.selectLanguage("es")
        selectWords("ran", "into")
        val state = currentState as AppState.Screen.ContextReview
        assertEquals("es", state.selectedLanguage)
    }

    @Test
    fun `addEntry emits CardCreationRequest with default en language`() = runTest {
        viewModel.startManualAdd()
        var received: CardCreationRequest? = null
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.addEntry("cat", "I have a cat")
        advanceUntilIdle()

        assertEquals("en", received?.language)
    }

    @Test
    fun `addEntry emits CardCreationRequest carrying the selected language`() = runTest {
        viewModel.startManualAdd()
        viewModel.selectLanguage("es")
        var received: CardCreationRequest? = null
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.addEntry("gato", "Tengo un gato")
        advanceUntilIdle()

        assertEquals("es", received?.language)
    }

    @Test
    fun `onContextEditSave carries the selected language into CardCreationRequest`() = runTest {
        viewModel.startSharedTextCapture("I ran into an old friend")
        viewModel.selectLanguage("de")
        selectWords("ran", "into")
        val reviewState = currentState as AppState.Screen.ContextReview
        viewModel.startContextEdit(reviewState.targetWord, reviewState.context)

        var received: CardCreationRequest? = null
        launch { received = viewModel.cardCreationRequest.first() }
        advanceUntilIdle()

        viewModel.onContextEditSave("Yesterday I ran into her again")
        advanceUntilIdle()

        assertEquals("de", received?.language)
    }
}
