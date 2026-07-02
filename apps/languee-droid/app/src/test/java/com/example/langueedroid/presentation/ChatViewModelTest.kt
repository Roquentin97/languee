package com.example.langueedroid.presentation

import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.ChatMessage
import com.example.langueedroid.core.domain.ChatSuggestion
import com.example.langueedroid.core.domain.Conversation
import com.example.langueedroid.core.domain.OverusedWordPayload
import com.example.langueedroid.core.domain.Role
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.domain.SuggestionsResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.chat.presentation.ChatError
import com.example.langueedroid.feature.chat.presentation.ChatState
import com.example.langueedroid.feature.chat.presentation.ChatViewModel
import com.example.langueedroid.feature.chat.presentation.SuggestionsUiState
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
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

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

    private fun buildViewModel(conversationId: String = "conv-1") =
        ChatViewModel(conversationId = conversationId, chatRepository = chatRepository)

    private fun aMessage(id: String, role: Role, content: String) = ChatMessage(
        id = id,
        role = role,
        content = content,
        createdAt = "2026-07-03T10:00:00.000Z",
    )

    private fun aConversation(messages: List<ChatMessage> = emptyList(), title: String? = "Restaurant roleplay") =
        Conversation(
            id = "conv-1",
            title = title,
            createdAt = "2026-07-01T10:00:00.000Z",
            messages = messages,
        )

    private fun anEmptySuggestions() = SuggestionsResult(analyzedAt = null, suggestions = emptyList())

    // -------------------------------------------------------------------------
    // loadConversation — success populates Loaded and quietly loads suggestions
    // -------------------------------------------------------------------------

    @Test
    fun `load conversation success — state is Loaded with messages, then suggestions load`() = runTest {
        val message = aMessage("msg-1", Role.USER, "Hi!")
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation(messages = listOf(message))))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.state.value
        assertTrue(state is ChatState.Loaded)
        state as ChatState.Loaded
        assertEquals("Restaurant roleplay", state.title)
        assertEquals(listOf(message), state.messages)
        assertEquals("", state.input)
        assertFalse(state.isSending)

        val suggestionsState = vm.suggestionsState.value
        assertTrue(suggestionsState is SuggestionsUiState.Loaded)
        assertTrue((suggestionsState as SuggestionsUiState.Loaded).suggestions.isEmpty())
        assertNull(suggestionsState.analyzedAt)
    }

    // -------------------------------------------------------------------------
    // loadConversation — failure surfaces Error, retry recovers
    // -------------------------------------------------------------------------

    @Test
    fun `load conversation failure — Error state shown, retry recovers`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.failure(RuntimeException("network failure")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val errorState = vm.state.value
        assertTrue(errorState is ChatState.Error)
        assertEquals(ChatError.LOAD_FAILED, (errorState as ChatState.Error).type)

        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        vm.retry()
        advanceUntilIdle()

        assertTrue(vm.state.value is ChatState.Loaded)
    }

    // -------------------------------------------------------------------------
    // loadConversation — 401 emits unauthorizedEvent
    // -------------------------------------------------------------------------

    @Test
    fun `load conversation 401 — unauthorizedEvent is emitted`() = runTest {
        // Init the VM with a successful response so init's coroutine completes without
        // emitting before a subscriber is attached (unauthorizedEvent has replay = 0).
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.loadConversation()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }

    // -------------------------------------------------------------------------
    // send — success appends both messages, clears input, toggles isSending
    // -------------------------------------------------------------------------

    @Test
    fun `send success — appends userMessage and assistantMessage, clears input, isSending toggles`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        val userMessage = aMessage("msg-1", Role.USER, "How do I order coffee?")
        val assistantMessage = aMessage("msg-2", Role.ASSISTANT, "You can say: I'd like a coffee, please.")
        whenever(chatRepository.sendMessage("conv-1", "How do I order coffee?")).thenReturn(
            Result.success(userMessage to assistantMessage),
        )

        vm.updateInput("How do I order coffee?")
        vm.send()
        advanceUntilIdle()

        val state = vm.state.value as ChatState.Loaded
        assertEquals(listOf(userMessage, assistantMessage), state.messages)
        assertEquals("", state.input)
        assertFalse(state.isSending)
        assertFalse(state.sendFailed)
    }

    // -------------------------------------------------------------------------
    // send — success triggers a quiet suggestions refresh
    // -------------------------------------------------------------------------

    @Test
    fun `send success — refreshes suggestions count quietly`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        val userMessage = aMessage("msg-1", Role.USER, "hi")
        val assistantMessage = aMessage("msg-2", Role.ASSISTANT, "hello")
        whenever(chatRepository.sendMessage("conv-1", "hi")).thenReturn(Result.success(userMessage to assistantMessage))
        val suggestion = ChatSuggestion(
            id = "sugg-1",
            type = SuggestionType.OVERUSED_WORD,
            title = "You use \"nice\" a lot",
            detail = "Try a synonym instead",
            overusedWordPayload = OverusedWordPayload(word = "nice", count = 5, synonyms = listOf("pleasant")),
            createdAt = "2026-07-03T10:00:00.000Z",
        )
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(
            Result.success(SuggestionsResult(analyzedAt = "2026-07-03T10:05:00.000Z", suggestions = listOf(suggestion))),
        )

        vm.updateInput("hi")
        vm.send()
        advanceUntilIdle()

        val suggestionsState = vm.suggestionsState.value as SuggestionsUiState.Loaded
        assertEquals(1, suggestionsState.suggestions.size)
    }

    // -------------------------------------------------------------------------
    // send — failure preserves input and flags sendFailed, without disrupting messages
    // -------------------------------------------------------------------------

    @Test
    fun `send failure — error preserved with input intact and isSending cleared`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.sendMessage("conv-1", "hello")).thenReturn(Result.failure(RuntimeException("network failure")))

        vm.updateInput("hello")
        vm.send()
        advanceUntilIdle()

        val state = vm.state.value as ChatState.Loaded
        assertEquals("hello", state.input)
        assertFalse(state.isSending)
        assertTrue(state.sendFailed)
        assertTrue(state.messages.isEmpty())
    }

    // -------------------------------------------------------------------------
    // send — 401 emits unauthorizedEvent and clears isSending
    // -------------------------------------------------------------------------

    @Test
    fun `send 401 — unauthorizedEvent is emitted`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.sendMessage("conv-1", "hello")).thenReturn(Result.failure(UnauthorizedException()))

        vm.updateInput("hello")
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.send()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
        assertFalse((vm.state.value as ChatState.Loaded).isSending)
    }

    // -------------------------------------------------------------------------
    // suggestions — explicit load: empty list and null analyzedAt states
    // -------------------------------------------------------------------------

    @Test
    fun `loadSuggestions — empty list and null analyzedAt maps to Loaded with empty suggestions`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.loadSuggestions()
        advanceUntilIdle()

        val state = vm.suggestionsState.value as SuggestionsUiState.Loaded
        assertNull(state.analyzedAt)
        assertTrue(state.suggestions.isEmpty())
    }

    @Test
    fun `loadSuggestions — repository failure maps to Error`() = runTest {
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.failure(RuntimeException("boom")))
        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.suggestionsState.value is SuggestionsUiState.Error)
    }

    @Test
    fun `loadSuggestions 401 — unauthorizedEvent is emitted`() = runTest {
        // Init the VM with a successful response so init's coroutine completes without
        // emitting before a subscriber is attached (unauthorizedEvent has replay = 0).
        whenever(chatRepository.getConversation("conv-1")).thenReturn(Result.success(aConversation()))
        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.success(anEmptySuggestions()))
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(chatRepository.getSuggestions("conv-1")).thenReturn(Result.failure(UnauthorizedException()))
        var unauthorizedCalled = false
        val job = launch { vm.unauthorizedEvent.first(); unauthorizedCalled = true }
        vm.loadSuggestions()
        advanceUntilIdle()
        job.cancel()

        assertTrue(unauthorizedCalled)
    }
}
