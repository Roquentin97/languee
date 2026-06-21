package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
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
import org.junit.Assert.assertNotNull
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

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        vocabularyRepository = mock()
        cardRepository = mock()
        ankiDroidExportRepository = mock()
        ankiDroidExportService = mock()
        prefsStore = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel(
        targetWord: String = "cat",
        context: String? = "I have a cat",
    ) = CardCreationViewModel(
        targetWord = targetWord,
        context = context,
        deckRepository = deckRepository,
        vocabularyRepository = vocabularyRepository,
        cardRepository = cardRepository,
        ankiDroidExportRepository = ankiDroidExportRepository,
        ankiDroidExportService = ankiDroidExportService,
        prefsStore = prefsStore,
    )

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private suspend fun stubAnkiSetupNotReady() {
        whenever(ankiDroidExportService.checkSetup(prefsStore))
            .thenReturn(AnkiDroidSetupCheckResult(isReady = false, issues = emptyList()))
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
    ) = LookupResult(
        input = "cat",
        lemma = "cat",
        definitions = definitions,
    )

    // -------------------------------------------------------------------------
    // No decks on entry → NeedsDeckCreation (Empty deck selection state)
    // -------------------------------------------------------------------------

    @Test
    fun `no decks exist on entry — DeckSelectionState is Empty`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(DeckSelectionState.Empty, vm.state.value.deckSelectionState)
    }

    // -------------------------------------------------------------------------
    // Deck loading — 401 → onUnauthorized
    // -------------------------------------------------------------------------

    @Test
    fun `loadDecks returns 401 — unauthorizedEvent is emitted`() = runTest {
        stubAnkiSetupNotReady()
        // Init with success so init completes without event emission
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
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

        val vm = buildViewModel()
        advanceUntilIdle()

        val deckState = vm.state.value.deckSelectionState
        assertTrue(deckState is DeckSelectionState.Error)
    }

    // -------------------------------------------------------------------------
    // Lookup called only after a deck is selected — not when deck list is empty
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup is never called when deck list is empty`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        verify(vocabularyRepository, never()).lookup(any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // Lookup after deck selected — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `onDeckSelected while SelectingDeck triggers vocabulary lookup`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.DefinitionsLoaded)
        verify(vocabularyRepository).lookup(eq("cat"), anyOrNull(), eq("I have a cat"))
    }

    // -------------------------------------------------------------------------
    // Lookup — 404 → LookupError with lookupFailed message
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup 404 — LookupError shown with message`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("Vocabulary lookup failed: HTTP 404")))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
        assertTrue((flowState as CardCreationFlowState.LookupError).message.isNotBlank())
    }

    // -------------------------------------------------------------------------
    // Lookup — 422 → LookupError (multi-word not supported)
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup 422 — LookupError shown`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("Vocabulary lookup failed: HTTP 422")))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
    }

    // -------------------------------------------------------------------------
    // Lookup — 502 → LookupError (service pending)
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup 502 — LookupError shown`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("Vocabulary lookup failed: HTTP 502")))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState
        assertTrue(flowState is CardCreationFlowState.LookupError)
    }

    // -------------------------------------------------------------------------
    // Lookup — 401 → onUnauthorized
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup 401 — unauthorizedEvent is emitted`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // Lookup — empty definitions list → NoDefinitions state
    // -------------------------------------------------------------------------

    @Test
    fun `vocabulary lookup returns 0 definitions — NoDefinitions state shown`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = emptyList())))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.NoDefinitions)
    }

    // -------------------------------------------------------------------------
    // onDeckSelected while DefinitionsLoaded — recomputes DefinitionState locally
    // -------------------------------------------------------------------------

    @Test
    fun `onDeckSelected while DefinitionsLoaded recomputes definition states without new lookup initially then re-fetches`() = runTest {
        val deck1 = aDeck(id = "d1")
        val deck2 = aDeck(id = "d2")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck1, deck2)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()

        // Select first deck → triggers lookup → DefinitionsLoaded
        vm.onDeckSelected(deck1)
        advanceUntilIdle()

        val flowState1 = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState1.definitions[0])
        // AlreadyInSelectedDeck → stays in DefinitionsLoaded; switch deck
        vm.onDeckSelected(deck2)
        advanceUntilIdle()

        // Lookup should have been called twice total (once per deck selection)
        verify(vocabularyRepository, times(2)).lookup(any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // onDefinitionSelected — Available definition transitions to SelectingExample
    // -------------------------------------------------------------------------

    @Test
    fun `onDefinitionSelected with Available definition — transitions to SelectingExample`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = emptyList())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        val updatedState = vm.state.value.flowState
        assertTrue(updatedState is CardCreationFlowState.SelectingExample)
        assertEquals(DefinitionState.Available, (updatedState as CardCreationFlowState.SelectingExample).definitionState)
    }

    // -------------------------------------------------------------------------
    // onDefinitionSelected — ExistsInAnotherDeck transitions to SelectingExample
    // -------------------------------------------------------------------------

    @Test
    fun `onDefinitionSelected with ExistsInAnotherDeck — transitions to SelectingExample`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "other", name = "Other")))
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        val updatedState = vm.state.value.flowState
        assertTrue(updatedState is CardCreationFlowState.SelectingExample)
        assertEquals(DefinitionState.ExistsInAnotherDeck, (updatedState as CardCreationFlowState.SelectingExample).definitionState)
    }

    // -------------------------------------------------------------------------
    // DefinitionState — AlreadyInSelectedDeck stays in DefinitionsLoaded
    // -------------------------------------------------------------------------

    @Test
    fun `definition decks contains selectedDeck id — stays in DefinitionsLoaded with AlreadyInSelectedDeck`() = runTest {
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = listOf(DeckRef(id = "d1", name = "MyDeck")))
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

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
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = emptyList())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
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
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = emptyList())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
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
        val deck = aDeck(id = "d1")
        val definition = aDefinition(deckRefs = emptyList())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
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
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("card-id"))
        stubAnkiSetupNotReady()

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        var cardCreatedCalled = false
        val job = launch { vm.cardCreatedEvent.first(); cardCreatedCalled = true }
        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.createCard()
        advanceUntilIdle()
        job.cancel()

        assertTrue(vm.state.value.flowState is CardCreationFlowState.CardCreated)
        assertTrue(cardCreatedCalled)
    }

    // -------------------------------------------------------------------------
    // createCard — double tap blocked while CreatingCard
    // -------------------------------------------------------------------------

    @Test
    fun `createCard tapped multiple times — second tap blocked`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("card-id"))
        stubAnkiSetupNotReady()

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")

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
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(CardAlreadyExistsException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
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
    fun `createCard returns 404 StaleReference — deck list reloaded and state resets to SelectingDeck`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(StaleReferenceException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
        vm.createCard()
        advanceUntilIdle()

        // loadDecks() is called after StaleReferenceException → deck list is refreshed
        // getDecks() is called twice: once on init, once after stale reference
        verify(deckRepository, times(2)).getDecks()
        // After loadDecks() completes the flowState returns to SelectingDeck
        assertTrue(vm.state.value.flowState is CardCreationFlowState.SelectingDeck)
    }

    // -------------------------------------------------------------------------
    // createCard — 401 → onUnauthorized
    // -------------------------------------------------------------------------

    @Test
    fun `createCard returns 401 — unauthorizedEvent is emitted`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
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
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("HTTP 500")))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed("I have a cat")
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
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        // State is AlreadyInSelectedDeck → createCard should be a no-op
        vm.createCard()
        advanceUntilIdle()

        verify(cardRepository, never()).createCard(any(), any(), anyOrNull(), anyOrNull())
    }
}
