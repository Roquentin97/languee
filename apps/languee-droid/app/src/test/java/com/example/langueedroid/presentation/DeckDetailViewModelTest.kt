package com.example.langueedroid.presentation

import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.decks.presentation.DeckDetailState
import com.example.langueedroid.feature.decks.presentation.DeckDetailViewModel
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class DeckDetailViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    private lateinit var cardRepository: CardRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        cardRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel(deckId: String = "d1") =
        DeckDetailViewModel(
            deckId = deckId,
            cardRepository = cardRepository,
        )

    private fun aCard(id: String = "c1") =
        Card(
            id = id,
            deckId = "d1",
            lemma = "cat",
            partOfSpeech = "noun",
            definition = "A small animal",
            example = "I have a cat.",
            context = null,
        )

    @Test
    fun `cards load on entry — Loaded state with the deck cards`() =
        runTest {
            whenever(cardRepository.listCards("d1")).thenReturn(Result.success(listOf(aCard())))

            val vm = buildViewModel()
            advanceUntilIdle()

            val state = vm.state.value
            assertTrue(state is DeckDetailState.Loaded)
            assertEquals("cat", (state as DeckDetailState.Loaded).cards[0].lemma)
        }

    @Test
    fun `deck with no cards — Empty state`() =
        runTest {
            whenever(cardRepository.listCards("d1")).thenReturn(Result.success(emptyList()))

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(DeckDetailState.Empty, vm.state.value)
        }

    @Test
    fun `load failure — Error state`() =
        runTest {
            whenever(cardRepository.listCards("d1")).thenReturn(
                Result.failure(RuntimeException("HTTP 500")),
            )

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(DeckDetailState.Error, vm.state.value)
        }

    @Test
    fun `retry after failure reloads the cards`() =
        runTest {
            whenever(cardRepository.listCards("d1")).thenReturn(
                Result.failure(RuntimeException("HTTP 500")),
            )
            val vm = buildViewModel()
            advanceUntilIdle()
            assertEquals(DeckDetailState.Error, vm.state.value)

            whenever(cardRepository.listCards("d1")).thenReturn(Result.success(listOf(aCard())))
            vm.loadCards()
            advanceUntilIdle()

            assertTrue(vm.state.value is DeckDetailState.Loaded)
        }

    @Test
    fun `401 — unauthorizedEvent is emitted`() =
        runTest {
            // Init with success so the init-time load completes without event emission
            whenever(cardRepository.listCards("d1")).thenReturn(Result.success(emptyList()))
            val vm = buildViewModel()
            advanceUntilIdle()

            whenever(cardRepository.listCards("d1")).thenReturn(
                Result.failure(UnauthorizedException()),
            )
            var unauthorizedCalled = false
            val job =
                launch {
                    vm.unauthorizedEvent.first()
                    unauthorizedCalled = true
                }
            vm.loadCards()
            advanceUntilIdle()
            job.cancel()

            assertTrue(unauthorizedCalled)
        }
}
