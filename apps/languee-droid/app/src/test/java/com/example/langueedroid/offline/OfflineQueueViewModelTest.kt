package com.example.langueedroid.offline

import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.OfflineStateManager
import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.feature.offline.presentation.OfflineCardCreationRequest
import com.example.langueedroid.feature.offline.presentation.OfflineQueueViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class OfflineQueueViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var viewModel: OfflineQueueViewModel
    private lateinit var repository: OfflineQueueRepository
    private lateinit var offlineStateManager: OfflineStateManager
    private val cardRepository: CardRepository = mock()
    private val isOfflineFlow = MutableStateFlow(false)

    private val sampleEntry =
        OfflineEntry(
            id = "id-1",
            word = "serendipity",
            context = "A moment of serendipity.",
            capturedAt = System.currentTimeMillis(),
        )

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        repository = mock()
        offlineStateManager = mock()
        whenever(offlineStateManager.isOffline).thenReturn(isOfflineFlow)
        whenever(repository.getAll()).thenReturn(flowOf(listOf(sampleEntry)))
        whenever(repository.count()).thenReturn(flowOf(1))
        viewModel = OfflineQueueViewModel(repository, offlineStateManager, cardRepository)
    }

    @Test
    fun `retry sends the stored definition and lookup together`() =
        runTest {
            val entry =
                sampleEntry.copy(
                    pendingDefinitionId = "def",
                    pendingLookupId = "lookup",
                    pendingDeckId = "deck",
                    pendingInflectionForms = "{\"base\":\"saw\"}",
                )
            whenever(
                cardRepository.createCard("deck", "def", entry.context, mapOf("base" to "saw"), "lookup"),
            ).thenReturn(Result.success("card"))
            viewModel.onEntrySelected(entry)
            advanceUntilIdle()
            verify(cardRepository).createCard("deck", "def", entry.context, mapOf("base" to "saw"), "lookup")
            verify(repository).remove(entry.id)
        }

    @Test
    fun `failed retry keeps the queued choice`() =
        runTest {
            val entry = sampleEntry.copy(pendingDefinitionId = "def", pendingLookupId = "lookup", pendingDeckId = "deck")
            whenever(
                cardRepository.createCard("deck", "def", entry.context, null, "lookup"),
            ).thenReturn(Result.failure(IllegalStateException("unavailable")))
            viewModel.onEntrySelected(entry)
            advanceUntilIdle()
            verify(repository, never()).remove(entry.id)
            assertTrue(viewModel.state.value.retryFailed)
        }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state has entries from repository`() =
        runTest {
            val state = viewModel.state.first()
            assertEquals(listOf(sampleEntry), state.entries)
        }

    @Test
    fun `initial state reflects offline manager isOffline`() =
        runTest {
            isOfflineFlow.value = true
            advanceUntilIdle()
            val state = viewModel.state.first()
            assertTrue(state.isOffline)
        }

    @Test
    fun `onEntrySelected when online emits navigateToCardCreation`() =
        runTest {
            isOfflineFlow.value = false
            advanceUntilIdle()

            var received: OfflineCardCreationRequest? = null
            launch { received = viewModel.navigateToCardCreation.first() }
            advanceUntilIdle()

            viewModel.onEntrySelected(sampleEntry)
            advanceUntilIdle()

            assertEquals(sampleEntry.word, received?.word)
            assertEquals(sampleEntry.context, received?.context)
            assertEquals(sampleEntry.id, received?.entryId)
        }

    @Test
    fun `review retains lookup context and occurrence separately from example`() =
        runTest {
            val entry =
                sampleEntry.copy(
                    context = "Edited example",
                    language = "en",
                    lookupContext = "I saw the saw.",
                    selectionStart = 10,
                    selectionEnd = 13,
                )
            var received: OfflineCardCreationRequest? = null
            launch { received = viewModel.navigateToCardCreation.first() }
            advanceUntilIdle()
            viewModel.onEntrySelected(entry)
            advanceUntilIdle()
            assertEquals("en", received?.language)
            assertEquals("Edited example", received?.context)
            assertEquals("I saw the saw.", received?.lookupContext)
            assertEquals(10, received?.selectionStart)
            assertEquals(13, received?.selectionEnd)
        }

    @Test
    fun `onEntrySelected when offline does not emit navigation`() =
        runTest {
            isOfflineFlow.value = true
            advanceUntilIdle()

            var received: OfflineCardCreationRequest? = null
            val job = launch { received = viewModel.navigateToCardCreation.first() }

            viewModel.onEntrySelected(sampleEntry)
            advanceUntilIdle()

            job.cancel()
            assertEquals(null, received)
        }

    @Test
    fun `onStartReviewing when online emits navigateToCardCreation for first entry`() =
        runTest {
            isOfflineFlow.value = false
            advanceUntilIdle()

            var received: OfflineCardCreationRequest? = null
            launch { received = viewModel.navigateToCardCreation.first() }
            advanceUntilIdle()

            viewModel.onStartReviewing()
            advanceUntilIdle()

            assertEquals(sampleEntry.word, received?.word)
        }

    @Test
    fun `onStartReviewing when queue is empty does nothing`() =
        runTest {
            whenever(repository.getAll()).thenReturn(flowOf(emptyList()))
            viewModel = OfflineQueueViewModel(repository, offlineStateManager, cardRepository)
            isOfflineFlow.value = false
            advanceUntilIdle()

            var received: OfflineCardCreationRequest? = null
            val job = launch { received = viewModel.navigateToCardCreation.first() }

            viewModel.onStartReviewing()
            advanceUntilIdle()

            job.cancel()
            assertEquals(null, received)
        }

    @Test
    fun `state isOffline transitions from true to false when connectivity restored`() =
        runTest {
            isOfflineFlow.value = true
            advanceUntilIdle()
            assertTrue(viewModel.state.first().isOffline)

            isOfflineFlow.value = false
            advanceUntilIdle()
            assertFalse(viewModel.state.first().isOffline)
        }
}
