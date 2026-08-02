package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationError
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationViewModel
import com.example.langueedroid.feature.cardcreation.presentation.DeckSelectionState
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class CardCreationViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var deckRepository: DeckRepository
    private lateinit var vocabularyRepository: VocabularyRepository
    private lateinit var cardRepository: CardRepository
    private lateinit var ankiDroidExportRepository: AnkiDroidExportRepository
    private lateinit var ankiDroidExportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore
    private lateinit var speaker: Speaker

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        vocabularyRepository = mock()
        cardRepository = mock()
        ankiDroidExportRepository = mock()
        ankiDroidExportService = mock()
        prefsStore = mock()
        speaker = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel(
        targetWord: String = "cat",
        context: String? = "I have a cat",
        language: String = "en",
    ) = CardCreationViewModel(
        targetWord = targetWord,
        context = context,
        language = language,
        deckRepository = deckRepository,
        vocabularyRepository = vocabularyRepository,
        cardRepository = cardRepository,
        ankiDroidExportRepository = ankiDroidExportRepository,
        ankiDroidExportService = ankiDroidExportService,
        prefsStore = prefsStore,
        speaker = speaker,
    )

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private suspend fun stubAnkiSetupNotReady() {
        whenever(ankiDroidExportService.checkSetup(prefsStore))
            .thenReturn(AnkiDroidSetupCheckResult(isReady = false, issues = emptyList()))
    }

    private suspend fun stubDecks(vararg decks: Deck) {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(decks.toList()))
    }

    private suspend fun stubLookup(result: LookupResult = aLookupResult()) {
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(result))
    }

    private fun aDeck(id: String = "d1") = Deck(id = id, name = "MyDeck")

    private fun aDefinition(
        id: String = "def1",
        deckRefs: List<DeckRef> = emptyList(),
        example: String? = "I have a cat",
    ) = DefinitionResult(
        id = id,
        partOfSpeech = "noun",
        definition = "A small animal",
        example = example,
        provider = "dict",
        decks = deckRefs,
    )

    private fun aLookupResult(
        definitions: List<DefinitionResult> = listOf(aDefinition()),
        kind: LexicalKind = LexicalKind.WORD,
        providerMiss: Boolean = false,
        expressionContextFound: Boolean? = null,
    ) = LookupResult(
        input = "cat",
        lemma = "cat",
        definitions = definitions,
        kind = kind,
        providerMiss = providerMiss,
        expressionContextFound = expressionContextFound,
    )

    private fun aCreatedUserDefinition(
        id: String = "def_user_1",
        kind: LexicalKind = LexicalKind.PHRASAL_VERB,
    ) = CreatedUserDefinition(
        id = id,
        wordId = "word_1",
        lemma = "run into",
        kind = kind,
        partOfSpeech = "phrase",
        definition = "To encounter unexpectedly.",
        example = "I ran into an old friend.",
        provider = "user",
    )

    // -------------------------------------------------------------------------
    // Entry — lookup starts immediately, decks load in parallel
    // -------------------------------------------------------------------------

    @Test
    fun `lookup runs on entry without any deck selection`() = runTest {
        stubDecks(aDeck())
        stubLookup()

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.DefinitionsLoaded)
        verify(vocabularyRepository).lookup(eq("cat"), eq("en"), eq("I have a cat"))
    }

    @Test
    fun `lookup runs even when no decks exist — definitions are shown before deck choice`() = runTest {
        stubDecks()
        stubLookup()

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(DeckSelectionState.Empty, vm.state.value.deckSelectionState)
        assertTrue(vm.state.value.flowState is CardCreationFlowState.DefinitionsLoaded)
    }

    @Test
    fun `onDeckSelected does not re-trigger the lookup`() = runTest {
        val deck = aDeck()
        stubDecks(deck)
        stubLookup()

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        verify(vocabularyRepository, times(1)).lookup(any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // Deck loading — 401 → onUnauthorized
    // -------------------------------------------------------------------------

    @Test
    fun `loadDecks returns 401 — unauthorizedEvent is emitted`() = runTest {
        stubAnkiSetupNotReady()
        // Init with success so init completes without event emission
        stubDecks()
        stubLookup()
        val vm = buildViewModel()
        advanceUntilIdle()

        // Re-stub for 401 and explicitly trigger a deck reload
        whenever(deckRepository.getDecks()).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.loadDecks()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // Deck loading — network failure → DeckSelectionState.Error
    // -------------------------------------------------------------------------

    @Test
    fun `loadDecks network failure — DeckSelectionState transitions to Error`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(
            Result.failure(RuntimeException("timeout")),
        )
        stubLookup()

        val vm = buildViewModel()
        advanceUntilIdle()

        val deckState = vm.state.value.deckSelectionState
        assertTrue(deckState is DeckSelectionState.Error)
    }

    // -------------------------------------------------------------------------
    // Lookup — assisted language is threaded through to the repository call
    // -------------------------------------------------------------------------

    @Test
    fun `lookup is called with the assisted language`() = runTest {
        stubDecks(aDeck())
        stubLookup()

        buildViewModel(language = "es")
        advanceUntilIdle()

        verify(vocabularyRepository).lookup(eq("cat"), eq("es"), eq("I have a cat"))
    }

    @Test
    fun `state carries the assisted language for the header speaker button`() = runTest {
        stubDecks()
        stubLookup()

        val vm = buildViewModel(language = "de")
        advanceUntilIdle()

        assertEquals("de", vm.state.value.language)
    }

    // -------------------------------------------------------------------------
    // Lookup failures → LookupError variants
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup 404 — LookupError shown with message`() = runTest {
        stubDecks(aDeck())
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("Vocabulary lookup failed: HTTP 404")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
        assertEquals(CardCreationError.LOOKUP_FAILED, (flowState as CardCreationFlowState.LookupError).type)
    }

    @Test
    fun `vocabulary lookup 502 — LookupError shown`() = runTest {
        stubDecks(aDeck())
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("Vocabulary lookup failed: HTTP 502")))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.LookupError)
    }

    @Test
    fun `vocabulary lookup 401 — unauthorizedEvent is emitted`() = runTest {
        // Init with success so the init-time lookup completes without event emission
        stubDecks(aDeck())
        stubLookup()
        val vm = buildViewModel()
        advanceUntilIdle()

        // Re-stub for 401 and explicitly trigger a retry
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.retryLookup()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    @Test
    fun `vocabulary lookup ExpressionTooLongException — LookupError with EXPRESSION_TOO_LONG`() = runTest {
        stubDecks(aDeck())
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(ExpressionTooLongException()))

        val vm = buildViewModel(targetWord = "one two three four five six seven")
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
        assertEquals(CardCreationError.EXPRESSION_TOO_LONG, (flowState as CardCreationFlowState.LookupError).type)
    }

    @Test
    fun `vocabulary lookup LookupInputInvalidException — LookupError with LOOKUP_INPUT_INVALID`() = runTest {
        stubDecks(aDeck())
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(LookupInputInvalidException()))

        val vm = buildViewModel(targetWord = "state-of-the-art")
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
        assertEquals(CardCreationError.LOOKUP_INPUT_INVALID, (flowState as CardCreationFlowState.LookupError).type)
    }

    // -------------------------------------------------------------------------
    // Lookup — empty definitions list → NoDefinitions state
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup returns 0 definitions — NoDefinitions state shown`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.NoDefinitions)
    }

    // -------------------------------------------------------------------------
    // Deck switching — recomputes DefinitionState locally, no new lookup
    // -------------------------------------------------------------------------

    @Test
    fun `deck switch recomputes definition state without a new lookup`() = runTest {
        val deck1 = aDeck(id = "d1")
        val deck2 = aDeck(id = "d2")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        stubDecks(deck1, deck2)
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck1)
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        // Already in deck1 → stays in DefinitionsLoaded
        val selected = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals(DefinitionState.AlreadyInSelectedDeck, selected.definitionState)

        // Switching to deck2 downgrades to ExistsInAnotherDeck without re-fetching
        vm.onDeckSelected(deck2)
        advanceUntilIdle()

        val switched = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals(DefinitionState.ExistsInAnotherDeck, switched.definitionState)
        verify(vocabularyRepository, times(1)).lookup(any(), anyOrNull(), anyOrNull())
    }

    @Test
    fun `deck selection during example choice recomputes the definition state`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        // No deck selected yet → saved-elsewhere, proceeds to example selection
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        assertTrue(vm.state.value.flowState is CardCreationFlowState.SelectingExample)

        vm.onDeckSelected(deck)

        val updated = vm.state.value.flowState as CardCreationFlowState.SelectingExample
        assertEquals(DefinitionState.AlreadyInSelectedDeck, updated.definitionState)
    }

    // -------------------------------------------------------------------------
    // onDefinitionSelected — works before any deck is chosen
    // -------------------------------------------------------------------------

    @Test
    fun `onDefinitionSelected with Available definition — transitions to SelectingExample`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = listOf(aDefinition(deckRefs = emptyList()))))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        val updatedState = vm.state.value.flowState
        assertTrue(updatedState is CardCreationFlowState.SelectingExample)
        assertEquals(DefinitionState.Available, (updatedState as CardCreationFlowState.SelectingExample).definitionState)
    }

    @Test
    fun `onDefinitionSelected with ExistsInAnotherDeck — transitions to SelectingExample`() = runTest {
        stubDecks(aDeck(id = "d1"))
        stubLookup(aLookupResult(definitions = listOf(aDefinition(deckRefs = listOf(DeckRef(id = "other", name = "Other"))))))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        val updatedState = vm.state.value.flowState
        assertTrue(updatedState is CardCreationFlowState.SelectingExample)
        assertEquals(DefinitionState.ExistsInAnotherDeck, (updatedState as CardCreationFlowState.SelectingExample).definitionState)
    }

    @Test
    fun `definition decks contains selectedDeck id — stays in DefinitionsLoaded with AlreadyInSelectedDeck`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        val updatedFlowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals(DefinitionState.AlreadyInSelectedDeck, updatedFlowState.definitionState)
    }

    // -------------------------------------------------------------------------
    // onExampleConfirmed — transitions back to DefinitionsLoaded with example
    // -------------------------------------------------------------------------

    @Test
    fun `onExampleConfirmed with text — DefinitionsLoaded with confirmedExample set`() = runTest {
        val definition = aDefinition(deckRefs = emptyList())
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")

        val confirmedState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals("I have a cat", confirmedState.confirmedExample)
        assertEquals(definition, confirmedState.selectedDefinition)
        assertEquals(DefinitionState.Available, confirmedState.definitionState)
    }

    @Test
    fun `onExampleConfirmed with null — DefinitionsLoaded with no confirmedExample`() = runTest {
        val definition = aDefinition(deckRefs = emptyList())
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed(null)

        val confirmedState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertNull(confirmedState.confirmedExample)
        assertEquals(definition, confirmedState.selectedDefinition)
    }

    // -------------------------------------------------------------------------
    // onBackFromExampleSelection — returns to DefinitionsLoaded with no selection
    // -------------------------------------------------------------------------

    @Test
    fun `onBackFromExampleSelection — DefinitionsLoaded with no selected definition`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = listOf(aDefinition(deckRefs = emptyList()))))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        assertTrue(vm.state.value.flowState is CardCreationFlowState.SelectingExample)

        vm.onBackFromExampleSelection()

        val backState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertNull(backState.selectedDefinition)
        assertNull(backState.definitionState)
        assertNull(backState.confirmedExample)
    }

    // -------------------------------------------------------------------------
    // createCard — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `createCard success — CardCreated state and cardCreatedEvent emitted`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(definition)))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("card-id"))
        stubAnkiSetupNotReady()

        val vm = buildViewModel()
        advanceUntilIdle()

        var cardCreatedCalled = false
        val job = launch { vm.cardCreatedEvent.first(); cardCreatedCalled = true }
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)
        vm.createCard()
        advanceUntilIdle()
        job.cancel()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.CardCreated)
        assertTrue(cardCreatedCalled)
    }

    // -------------------------------------------------------------------------
    // createCard — requires a selected deck
    // -------------------------------------------------------------------------

    @Test
    fun `createCard without a selected deck is a no-op`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.createCard()
        advanceUntilIdle()

        verify(cardRepository, never()).createCard(any(), any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // createCard — double tap blocked while CreatingCard
    // -------------------------------------------------------------------------

    @Test
    fun `createCard tapped multiple times — second tap blocked`() = runTest {
        val deck = aDeck()
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("card-id"))
        stubAnkiSetupNotReady()

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)

        // Fire twice without advancing
        vm.createCard()
        vm.createCard()
        advanceUntilIdle()

        // createCard should only be called once in the repository
        verify(cardRepository, times(1)).createCard(any(), any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // createCard — 409 CARD_ALREADY_EXISTS → DefinitionsLoaded with AlreadyInSelectedDeck
    // -------------------------------------------------------------------------

    @Test
    fun `createCard returns 409 CARD_ALREADY_EXISTS — restores DefinitionsLoaded with AlreadyInSelectedDeck`() = runTest {
        val deck = aDeck(id = "d1")
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(CardAlreadyExistsException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)
        vm.createCard()
        advanceUntilIdle()

        val finalState = vm.state.value.flowState
        assertTrue(finalState is CardCreationFlowState.DefinitionsLoaded)
        assertEquals(
            DefinitionState.AlreadyInSelectedDeck,
            (finalState as CardCreationFlowState.DefinitionsLoaded).definitionState,
        )
    }

    // -------------------------------------------------------------------------
    // createCard — 404 DECK/DEFINITION_NOT_FOUND → CreateCardError then loadDecks() called
    // -------------------------------------------------------------------------

    @Test
    fun `createCard returns 404 StaleReference — CreateCardError shown and deck list reloaded`() = runTest {
        val deck = aDeck()
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(StaleReferenceException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)
        vm.createCard()
        advanceUntilIdle()

        // loadDecks() is called after StaleReferenceException → deck list is refreshed.
        // getDecks() is called twice: once on init, once after stale reference.
        verify(deckRepository, times(2)).getDecks()
        assertTrue(vm.state.value.flowState is CardCreationFlowState.CreateCardError)
    }

    // -------------------------------------------------------------------------
    // createCard — 401 → onUnauthorized
    // -------------------------------------------------------------------------

    @Test
    fun `createCard returns 401 — unauthorizedEvent is emitted`() = runTest {
        val deck = aDeck()
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)
        vm.createCard()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // createCard — 500 / network failure → CreateCardError
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 500 or network failure — CreateCardError shown`() = runTest {
        val deck = aDeck()
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(aDefinition())))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("HTTP 500")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.onDeckSelected(deck)
        vm.createCard()
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.CreateCardError)
    }

    // -------------------------------------------------------------------------
    // createCard — blocked when AlreadyInSelectedDeck
    // -------------------------------------------------------------------------

    @Test
    fun `createCard is blocked when definition is AlreadyInSelectedDeck`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        stubDecks(deck)
        stubLookup(aLookupResult(definitions = listOf(definition)))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        // State is AlreadyInSelectedDeck → createCard should be a no-op
        vm.createCard()
        advanceUntilIdle()

        verify(cardRepository, never()).createCard(any(), any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // Expression lookup — kind and context-not-found warning
    // -------------------------------------------------------------------------

    @Test
    fun `lookup for an expression sets state kind to PHRASAL_VERB`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(kind = LexicalKind.PHRASAL_VERB))

        val vm = buildViewModel(targetWord = "ran into")
        advanceUntilIdle()

        assertEquals(LexicalKind.PHRASAL_VERB, vm.state.value.kind)
    }

    @Test
    fun `lookup with expressionContextFound false is reflected in state`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(kind = LexicalKind.EXPRESSION, expressionContextFound = false))

        val vm = buildViewModel(targetWord = "spill the beans")
        advanceUntilIdle()

        assertEquals(false, vm.state.value.expressionContextFound)
    }

    @Test
    fun `lookup for a plain word leaves kind as WORD`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(kind = LexicalKind.WORD))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(LexicalKind.WORD, vm.state.value.kind)
    }

    // -------------------------------------------------------------------------
    // providerMiss — transitions to ManualDefinition instead of NoDefinitions
    // -------------------------------------------------------------------------

    @Test
    fun `empty definitions with providerMiss true — ManualDefinition state shown`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))

        val vm = buildViewModel(targetWord = "spill the beans")
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.ManualDefinition)
    }

    @Test
    fun `empty definitions with providerMiss false — NoDefinitions state shown, not ManualDefinition`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), providerMiss = false))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.NoDefinitions)
    }

    // -------------------------------------------------------------------------
    // submitManualDefinition — happy path (no deck selection required)
    // -------------------------------------------------------------------------

    @Test
    fun `submitManualDefinition success proceeds to SelectingExample with returned definition`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))
        whenever(vocabularyRepository.createUserDefinition(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aCreatedUserDefinition(id = "def_user_1")))

        val vm = buildViewModel(targetWord = "run into")
        advanceUntilIdle()

        vm.onManualDefinitionTextChanged("To encounter unexpectedly.")
        vm.submitManualDefinition()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.SelectingExample)
        assertEquals("def_user_1", (flowState as CardCreationFlowState.SelectingExample).selectedDefinition.id)
        assertEquals(DefinitionState.Available, flowState.definitionState)
        assertEquals(LexicalKind.PHRASAL_VERB, vm.state.value.kind)
        verify(vocabularyRepository).createUserDefinition(
            eq("run into"),
            eq("To encounter unexpectedly."),
            eq("en"),
            anyOrNull(),
        )
    }

    @Test
    fun `submitManualDefinition passes the assisted language`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))
        whenever(vocabularyRepository.createUserDefinition(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aCreatedUserDefinition(id = "def_user_1")))

        val vm = buildViewModel(targetWord = "run into", language = "de")
        advanceUntilIdle()

        vm.onManualDefinitionTextChanged("To encounter unexpectedly.")
        vm.submitManualDefinition()
        advanceUntilIdle()

        verify(vocabularyRepository).createUserDefinition(
            eq("run into"),
            eq("To encounter unexpectedly."),
            eq("de"),
            anyOrNull(),
        )
    }

    @Test
    fun `submitManualDefinition with blank text is a no-op`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))

        val vm = buildViewModel(targetWord = "run into")
        advanceUntilIdle()

        vm.submitManualDefinition()
        advanceUntilIdle()

        verify(vocabularyRepository, never()).createUserDefinition(any(), any(), anyOrNull(), anyOrNull())
        assertTrue(vm.state.value.flowState is CardCreationFlowState.ManualDefinition)
    }

    // -------------------------------------------------------------------------
    // submitManualDefinition — 409 conflict re-fetches lookup
    // -------------------------------------------------------------------------

    @Test
    fun `submitManualDefinition 409 re-fetches lookup and surfaces a notice`() = runTest {
        val existingDefinition = aDefinition(id = "existing_def")
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))
        whenever(vocabularyRepository.createUserDefinition(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(DefinitionAlreadyExistsException()))

        val vm = buildViewModel(targetWord = "run into")
        advanceUntilIdle()

        vm.onManualDefinitionTextChanged("To encounter unexpectedly.")
        // Re-stub lookup for the retry triggered by the 409 so it now returns the existing definition.
        stubLookup(aLookupResult(definitions = listOf(existingDefinition), kind = LexicalKind.EXPRESSION))
        vm.submitManualDefinition()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.DefinitionsLoaded)
        assertEquals(CardCreationError.DEFINITION_ALREADY_EXISTS, (flowState as CardCreationFlowState.DefinitionsLoaded).notice)
        assertEquals("existing_def", flowState.definitions[0].id)
        verify(vocabularyRepository, times(2)).lookup(any(), anyOrNull(), anyOrNull())
    }

    @Test
    fun `submitManualDefinition 401 — unauthorizedEvent is emitted`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))
        whenever(vocabularyRepository.createUserDefinition(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel(targetWord = "run into")
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        advanceUntilIdle()

        vm.onManualDefinitionTextChanged("To encounter unexpectedly.")
        vm.submitManualDefinition()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    @Test
    fun `submitManualDefinition generic failure — inline error shown, form retained`() = runTest {
        stubDecks(aDeck())
        stubLookup(aLookupResult(definitions = emptyList(), kind = LexicalKind.EXPRESSION, providerMiss = true))
        whenever(vocabularyRepository.createUserDefinition(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("HTTP 500")))

        val vm = buildViewModel(targetWord = "run into")
        advanceUntilIdle()

        vm.onManualDefinitionTextChanged("To encounter unexpectedly.")
        vm.submitManualDefinition()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.ManualDefinition)
        assertEquals(CardCreationError.MANUAL_DEFINITION_FAILED, (flowState as CardCreationFlowState.ManualDefinition).error)
        assertFalse(flowState.isSubmitting)
    }
}
