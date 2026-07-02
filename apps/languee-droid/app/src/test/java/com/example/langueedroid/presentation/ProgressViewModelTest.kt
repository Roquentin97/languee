package com.example.langueedroid.presentation

import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.ChatProgress
import com.example.langueedroid.core.domain.ProgressByType
import com.example.langueedroid.core.domain.ProgressTotals
import com.example.langueedroid.core.domain.ProgressWeek
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.progress.presentation.ProgressState
import com.example.langueedroid.feature.progress.presentation.ProgressViewModel
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
class ProgressViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var chatRepository: ChatRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        chatRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = ProgressViewModel(chatRepository = chatRepository)

    private fun aProgress(
        suggestionsRaised: Int = 12,
        weeks: List<ProgressWeek> = listOf(
            ProgressWeek(weekStart = "2026-06-15", raised = 4, resolved = 1, userMessages = 30),
        ),
    ) = ChatProgress(
        totals = ProgressTotals(
            suggestionsRaised = suggestionsRaised,
            suggestionsResolved = 7,
            resolutionRate = 0.58,
            userMessages = 140,
            activeConversations = 3,
        ),
        byType = listOf(
            ProgressByType(type = SuggestionType.OVERUSED_WORD, raised = 5, resolved = 3),
        ),
        weeks = weeks,
        computedAt = "2026-07-03T00:00:00.000Z",
    )

    // -------------------------------------------------------------------------
    // load — non-empty progress -> Loaded
    // -------------------------------------------------------------------------

    @Test
    fun `load with progress — state is Loaded with the progress`() = runTest {
        val progress = aProgress()
        whenever(chatRepository.progress()).thenReturn(Result.success(progress))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.state.value
        assertTrue(state is ProgressState.Loaded)
        assertEquals(progress, (state as ProgressState.Loaded).progress)
    }

    // -------------------------------------------------------------------------
    // load — zero raised and no weeks -> Empty
    // -------------------------------------------------------------------------

    @Test
    fun `load with zero raised and no weeks — state is Empty`() = runTest {
        val progress = aProgress(suggestionsRaised = 0, weeks = emptyList())
        whenever(chatRepository.progress()).thenReturn(Result.success(progress))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(ProgressState.Empty, vm.state.value)
    }

    // -------------------------------------------------------------------------
    // load — zero raised but weeks present -> not Empty (Loaded)
    // -------------------------------------------------------------------------

    @Test
    fun `load with zero raised but non-empty weeks — state is Loaded, not Empty`() = runTest {
        val progress = aProgress(
            suggestionsRaised = 0,
            weeks = listOf(ProgressWeek(weekStart = "2026-06-15", raised = 0, resolved = 0, userMessages = 10)),
        )
        whenever(chatRepository.progress()).thenReturn(Result.success(progress))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.state.value is ProgressState.Loaded)
    }

    // -------------------------------------------------------------------------
    // load — failure -> Error, retry (via refresh) recovers
    // -------------------------------------------------------------------------

    @Test
    fun `load failure — Error state shown, refresh recovers`() = runTest {
        whenever(chatRepository.progress()).thenReturn(Result.failure(RuntimeException("network failure")))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(ProgressState.Error, vm.state.value)

        val progress = aProgress()
        whenever(chatRepository.progress()).thenReturn(Result.success(progress))
        vm.refresh()
        advanceUntilIdle()

        assertTrue(vm.state.value is ProgressState.Loaded)
    }

    // -------------------------------------------------------------------------
    // load — 401 emits unauthorizedEvent
    // -------------------------------------------------------------------------

    @Test
    fun `load 401 — unauthorizedEvent is emitted`() = runTest {
        // Init the VM with a successful response so init's coroutine completes without
        // emitting before a subscriber is attached (unauthorizedEvent has replay = 0).
        whenever(chatRepository.progress()).thenReturn(Result.success(aProgress()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.progress()).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.refresh()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }
}
