package com.example.langueedroid.presentation

import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.ConversationSummary
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.chat.presentation.ConversationListError
import com.example.langueedroid.feature.chat.presentation.ConversationListState
import com.example.langueedroid.feature.chat.presentation.ConversationListViewModel
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
class ConversationListViewModelTest {

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

    private fun buildViewModel() = ConversationListViewModel(chatRepository = chatRepository)

    private fun aSummary(id: String = "conv-1") = ConversationSummary(
        id = id,
        title = "Restaurant roleplay",
        createdAt = "2026-07-01T10:00:00.000Z",
        updatedAt = "2026-07-03T10:00:00.000Z",
        messageCount = 4,
        lastMessagePreview = "Sure, a table for two.",
    )

    // -------------------------------------------------------------------------
    // load — items returned -> Success
    // -------------------------------------------------------------------------

    @Test
    fun `load with conversations — state is Success with the conversations`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.success(listOf(aSummary())))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.state.value
        assertTrue(state is ConversationListState.Success)
        assertEquals(listOf(aSummary()), (state as ConversationListState.Success).conversations)
    }

    // -------------------------------------------------------------------------
    // load — empty list -> Empty
    // -------------------------------------------------------------------------

    @Test
    fun `load with no conversations — state is Empty`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(ConversationListState.Empty, vm.state.value)
    }

    // -------------------------------------------------------------------------
    // load — failure -> Error, retry recovers
    // -------------------------------------------------------------------------

    @Test
    fun `load failure — Error state shown, retry recovers`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.failure(RuntimeException("network failure")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val errorState = vm.state.value
        assertTrue(errorState is ConversationListState.Error)
        assertEquals(ConversationListError.LOAD_FAILED, (errorState as ConversationListState.Error).type)

        whenever(chatRepository.getConversations()).thenReturn(Result.success(listOf(aSummary())))
        vm.retry()
        advanceUntilIdle()

        assertTrue(vm.state.value is ConversationListState.Success)
    }

    // -------------------------------------------------------------------------
    // load — 401 emits unauthorizedEvent
    // -------------------------------------------------------------------------

    @Test
    fun `load 401 — unauthorizedEvent is emitted`() = runTest {
        // Init the VM with a successful response so init's coroutine completes without
        // emitting before a subscriber is attached (unauthorizedEvent has replay = 0).
        whenever(chatRepository.getConversations()).thenReturn(Result.success(emptyList()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.getConversations()).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.loadConversations()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // createConversation — success emits conversationCreated with the new id
    // -------------------------------------------------------------------------

    @Test
    fun `createConversation success — emits conversationCreated with the new conversation id`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.success(emptyList()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.createConversation()).thenReturn(Result.success(aSummary(id = "conv-new")))

        var createdId: String? = null
        val job = launch { createdId = vm.conversationCreated.first() }
        vm.createConversation()
        advanceUntilIdle()
        job.cancel()

        assertEquals("conv-new", createdId)
    }

    // -------------------------------------------------------------------------
    // createConversation — failure maps to Error(CREATE_FAILED)
    // -------------------------------------------------------------------------

    @Test
    fun `createConversation failure — Error state with CREATE_FAILED`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.success(emptyList()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.createConversation()).thenReturn(Result.failure(RuntimeException("boom")))
        vm.createConversation()
        advanceUntilIdle()

        val state = vm.state.value
        assertTrue(state is ConversationListState.Error)
        assertEquals(ConversationListError.CREATE_FAILED, (state as ConversationListState.Error).type)
    }

    // -------------------------------------------------------------------------
    // createConversation — 401 emits unauthorizedEvent
    // -------------------------------------------------------------------------

    @Test
    fun `createConversation 401 — unauthorizedEvent is emitted`() = runTest {
        whenever(chatRepository.getConversations()).thenReturn(Result.success(emptyList()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.createConversation()).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.createConversation()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }
}
