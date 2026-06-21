package com.example.langueedroid.presentation

import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DeckConflictException
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class DecksViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var deckRepository: DeckRepository
    private var unauthorizedCalled = false

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        unauthorizedCalled = false
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = DecksViewModel(
        deckRepository = deckRepository,
        onUnauthorized = { unauthorizedCalled = true },
    )

    // -------------------------------------------------------------------------
    // loadDecks — empty list → Empty state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns empty list — state transitions to Empty`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(DecksScreenState.Empty, vm.decksState.value)
    }

    // -------------------------------------------------------------------------
    // loadDecks — non-empty list → Success state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns decks — state transitions to Success with deck list`() = runTest {
        val decks = listOf(Deck(id = "d1", name = "French"))
        whenever(deckRepository.getDecks()).thenReturn(Result.success(decks))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.decksState.value
        assertTrue(state is DecksScreenState.Success)
        assertEquals(decks, (state as DecksScreenState.Success).decks)
    }

    // -------------------------------------------------------------------------
    // loadDecks — 401 → onUnauthorized called
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns 401 — onUnauthorized is called`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // loadDecks — network failure → Error state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns network failure — state transitions to Error with message`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(
            Result.failure(RuntimeException("network failure")),
        )

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.decksState.value
        assertTrue(state is DecksScreenState.Error)
        assertTrue((state as DecksScreenState.Error).message.isNotBlank())
    }

    // -------------------------------------------------------------------------
    // initial state is Loading
    // -------------------------------------------------------------------------

    @Test
    fun `initial state before coroutine completes is Loading`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        // Do not advance — should still be loading
        assertEquals(DecksScreenState.Loading, vm.decksState.value)
    }

    // -------------------------------------------------------------------------
    // createDeck — happy path: reloads decks and fires onCreated
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck success calls onCreated and reloads decks`() = runTest {
        val deck = Deck(id = "d1", name = "French")
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(deckRepository.createDeck(name = "French"))
            .thenReturn(Result.success(deck))

        val vm = buildViewModel()
        advanceUntilIdle()

        var onCreatedCalled = false
        vm.createDeck(name = "French", onCreated = { onCreatedCalled = true })
        advanceUntilIdle()

        assertTrue(onCreatedCalled)
        // getDecks called once on init + once after createDeck
        verify(deckRepository, org.mockito.kotlin.times(2)).getDecks()
    }

    // -------------------------------------------------------------------------
    // createDeck — 409 Conflict → DeckConflictException → Error state
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck 409 Conflict — Error state with message shown`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
        whenever(deckRepository.createDeck(name = "French"))
            .thenReturn(Result.failure(DeckConflictException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        var onCreatedCalled = false
        vm.createDeck(name = "French", onCreated = { onCreatedCalled = true })
        advanceUntilIdle()

        val state = vm.decksState.value
        assertTrue(state is DecksScreenState.Error)
        assertTrue((state as DecksScreenState.Error).message.isNotBlank())
        assertTrue(!onCreatedCalled)
    }

    // -------------------------------------------------------------------------
    // createDeck — 401 → onUnauthorized called
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck 401 — onUnauthorized called`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
        whenever(deckRepository.createDeck(name = "French"))
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        unauthorizedCalled = false
        vm.createDeck(name = "French", onCreated = {})
        advanceUntilIdle()

        assertTrue(unauthorizedCalled)
    }
}
