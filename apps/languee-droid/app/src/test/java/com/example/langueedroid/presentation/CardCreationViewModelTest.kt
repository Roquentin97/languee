package com.example.langueedroid.presentation

import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.domain.CardAlreadyExistsException
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DeckRef
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.DefinitionState
import com.example.langueedroid.domain.LookupResult
import com.example.langueedroid.domain.StaleReferenceException
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
    private var unauthorizedCalled = false
    private var cardCreatedCalled = false

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        vocabularyRepository = mock()
        cardRepository = mock()
        unauthorizedCalled = false
        cardCreatedCalled = false
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
        onUnauthorized = { unauthorizedCalled = true },
        onCardCreated = { cardCreatedCalled = true },
    )

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aDeck(id: String = "d1", language: String = "en") =
        Deck(id = id, name = "MyDeck", language = language)

    private fun aDefinition(
        id: String = "def1",
        deckRefs: List<DeckRef> = emptyList(),
    ) = DefinitionResult(
        id = id,
        partOfSpeech = "noun",
        definition = "A small animal",
        example = "I have a cat",
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
    fun `loadDecks returns 401 — onUnauthorized called`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

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
        verify(vocabularyRepository).lookup(eq("cat"), eq("en"), anyOrNull())
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
    fun `vocabulary lookup 401 — onUnauthorized called`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

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

        // Switch deck while definitions are loaded
        vm.onDeckSelected(deck2)
        // Before the re-lookup completes, definition state should have been recomputed.
        // Advance to complete
        advanceUntilIdle()

        // Lookup should have been called twice total (once per deck selection)
        verify(vocabularyRepository, times(2)).lookup(any(), anyOrNull(), anyOrNull())
    }

    // -------------------------------------------------------------------------
    // DefinitionState — AlreadyInSelectedDeck
    // -------------------------------------------------------------------------

    @Test
    fun `definition decks contains selectedDeck id — DefinitionState AlreadyInSelectedDeck`() = runTest {
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
    // DefinitionState — ExistsInAnotherDeck
    // -------------------------------------------------------------------------

    @Test
    fun `definition decks non-empty but not selectedDeck — DefinitionState ExistsInAnotherDeck`() = runTest {
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

        val updatedFlowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals(DefinitionState.ExistsInAnotherDeck, updatedFlowState.definitionState)
    }

    // -------------------------------------------------------------------------
    // DefinitionState — Available
    // -------------------------------------------------------------------------

    @Test
    fun `definition decks empty — DefinitionState Available`() = runTest {
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

        val updatedFlowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        assertEquals(DefinitionState.Available, updatedFlowState.definitionState)
    }

    // -------------------------------------------------------------------------
    // createCard — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `createCard success — CardCreated state and onCardCreated fired`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.createCard()
        advanceUntilIdle()

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
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])

        // Fire twice without advancing
        vm.createCard()
        vm.createCard()
        advanceUntilIdle()

        // createCard should only be called once in the repository
        verify(cardRepository, times(1)).createCard(any(), any())
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
        whenever(cardRepository.createCard(any(), any()))
            .thenReturn(Result.failure(CardAlreadyExistsException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
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
        whenever(cardRepository.createCard(any(), any()))
            .thenReturn(Result.failure(StaleReferenceException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
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
    fun `createCard returns 401 — onUnauthorized called`() = runTest {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult(definitions = listOf(definition))))
        whenever(cardRepository.createCard(any(), any()))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.createCard()
        advanceUntilIdle()

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
        whenever(cardRepository.createCard(any(), any()))
            .thenReturn(Result.failure(RuntimeException("HTTP 500")))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
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

        verify(cardRepository, never()).createCard(any(), any())
    }
}
