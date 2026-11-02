package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckConflictException
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.decks.presentation.DecksError
import com.example.langueedroid.feature.decks.presentation.DecksScreenState
import com.example.langueedroid.feature.decks.presentation.DecksViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
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
    private lateinit var ankiDroidApi: AnkiDroidApi
    private lateinit var reviewRepository: ReviewRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        ankiDroidApi = mock()
        reviewRepository = mock()
        runBlocking {
            whenever(reviewRepository.summary()).thenReturn(Result.success(ReviewSummary(dueCount = 0, newCount = 0)))
        }
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() =
        DecksViewModel(
            deckRepository = deckRepository,
            ankiDroidApi = ankiDroidApi,
            reviewRepository = reviewRepository,
        )

    // -------------------------------------------------------------------------
    // loadDecks — empty list → Empty state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns empty list — state transitions to Empty`() =
        runTest {
            whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(DecksScreenState.Empty, vm.decksState.value)
        }

    // -------------------------------------------------------------------------
    // loadDecks — non-empty list → Success state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns decks — state transitions to Success with deck list`() =
        runTest {
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
    fun `getDecks returns 401 — unauthorizedEvent is emitted`() =
        runTest {
            // Init the VM with a successful response so init coroutine completes without emitting
            whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
            val vm = buildViewModel()
            advanceUntilIdle()

            // Now re-stub for 401 and explicitly trigger a reload with the subscriber active
            whenever(deckRepository.getDecks()).thenReturn(Result.failure(UnauthorizedException()))
            var unauthorizedCalled = false
            val job =
                launch {
                    vm.unauthorizedEvent.first()
                    unauthorizedCalled = true
                }
            vm.loadDecks()
            advanceUntilIdle()
            job.cancel()

            assertTrue(unauthorizedCalled)
        }

    // -------------------------------------------------------------------------
    // loadDecks — network failure → Error state
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks returns network failure — state transitions to Error with message`() =
        runTest {
            whenever(deckRepository.getDecks()).thenReturn(
                Result.failure(RuntimeException("network failure")),
            )

            val vm = buildViewModel()
            advanceUntilIdle()

            val state = vm.decksState.value
            assertTrue(state is DecksScreenState.Error)
            assertEquals(DecksError.LOAD_FAILED, (state as DecksScreenState.Error).type)
        }

    // -------------------------------------------------------------------------
    // initial state is Loading
    // -------------------------------------------------------------------------

    @Test
    fun `initial state before coroutine completes is Loading`() =
        runTest {
            whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))

            val vm = buildViewModel()
            // Do not advance — should still be loading
            assertEquals(DecksScreenState.Loading, vm.decksState.value)
        }

    // -------------------------------------------------------------------------
    // createDeck — happy path: reloads decks and fires onCreated
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck success calls onCreated and reloads decks`() =
        runTest {
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
    fun `createDeck 409 Conflict — Error state with message shown`() =
        runTest {
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
            assertEquals(DecksError.CREATE_FAILED, (state as DecksScreenState.Error).type)
            assertTrue(!onCreatedCalled)
        }

    // -------------------------------------------------------------------------
    // createDeck — 401 → unauthorizedEvent emitted
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck 401 — unauthorizedEvent is emitted`() =
        runTest {
            whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
            whenever(deckRepository.createDeck(name = "French"))
                .thenReturn(Result.failure(UnauthorizedException()))

            val vm = buildViewModel()
            advanceUntilIdle()

            var unauthorizedCalled = false
            val job =
                launch {
                    vm.unauthorizedEvent.first()
                    unauthorizedCalled = true
                }
            vm.createDeck(name = "French", onCreated = {})
            advanceUntilIdle()
            job.cancel()

            assertTrue(unauthorizedCalled)
        }

    // -------------------------------------------------------------------------
    // dueReviewCount — summary success sets the badge value
    // -------------------------------------------------------------------------

    @Test
    fun `review summary success — dueReviewCount is set`() =
        runTest {
            whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
            whenever(reviewRepository.summary()).thenReturn(Result.success(ReviewSummary(dueCount = 5, newCount = 3)))

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(5, vm.dueReviewCount.value)
        }

    // -------------------------------------------------------------------------
    // dueReviewCount — summary failure hides the badge without affecting decksState
    // -------------------------------------------------------------------------

    @Test
    fun `review summary failure — dueReviewCount stays hidden and decksState is unaffected`() =
        runTest {
            val decks = listOf(Deck(id = "d1", name = "French"))
            whenever(deckRepository.getDecks()).thenReturn(Result.success(decks))
            whenever(reviewRepository.summary()).thenReturn(Result.failure(RuntimeException("network failure")))

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(null, vm.dueReviewCount.value)
            val state = vm.decksState.value
            assertTrue(state is DecksScreenState.Success)
            assertEquals(decks, (state as DecksScreenState.Success).decks)
        }
}
