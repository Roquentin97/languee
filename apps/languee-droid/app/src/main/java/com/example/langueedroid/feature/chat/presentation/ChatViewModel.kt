package com.example.langueedroid.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel(assistedFactory = ChatViewModel.Factory::class)
class ChatViewModel @AssistedInject constructor(
    @Assisted("conversationId") private val conversationId: String,
    private val chatRepository: ChatRepository,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(
            @Assisted("conversationId") conversationId: String,
        ): ChatViewModel
    }

    private val _state = MutableStateFlow<ChatState>(ChatState.Loading)
    val state: StateFlow<ChatState> = _state.asStateFlow()

    private val _suggestionsState = MutableStateFlow<SuggestionsUiState>(SuggestionsUiState.Loading)
    val suggestionsState: StateFlow<SuggestionsUiState> = _suggestionsState.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    private var sendJob: Job? = null

    init {
        loadConversation()
    }

    fun loadConversation() {
        _state.value = ChatState.Loading
        viewModelScope.launch {
            chatRepository.getConversation(conversationId).fold(
                onSuccess = { conversation ->
                    _state.value = ChatState.Loaded(
                        title = conversation.title,
                        messages = conversation.messages,
                        input = "",
                        isSending = false,
                    )
                    loadSuggestions()
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _state.value = ChatState.Error(ChatError.LOAD_FAILED)
                    }
                },
            )
        }
    }

    fun updateInput(text: String) {
        val current = _state.value as? ChatState.Loaded ?: return
        _state.value = current.copy(input = text, sendFailed = false)
    }

    fun send() {
        val current = _state.value as? ChatState.Loaded ?: return
        if (current.isSending) return
        if (sendJob?.isActive == true) return
        val content = current.input.trim()
        if (content.isEmpty()) return

        sendJob = viewModelScope.launch {
            _state.value = current.copy(isSending = true, sendFailed = false)
            chatRepository.sendMessage(conversationId, content).fold(
                onSuccess = { (userMessage, assistantMessage) ->
                    _state.value = current.copy(
                        messages = current.messages + userMessage + assistantMessage,
                        input = "",
                        isSending = false,
                        sendFailed = false,
                    )
                    refreshSuggestionsQuietly()
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                        _state.value = current.copy(isSending = false)
                    } else {
                        _state.value = current.copy(isSending = false, sendFailed = true)
                    }
                },
            )
        }
    }

    fun loadSuggestions() {
        _suggestionsState.value = SuggestionsUiState.Loading
        viewModelScope.launch {
            chatRepository.getSuggestions(conversationId).fold(
                onSuccess = { result ->
                    _suggestionsState.value = SuggestionsUiState.Loaded(
                        analyzedAt = result.analyzedAt,
                        suggestions = result.suggestions,
                    )
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _suggestionsState.value = SuggestionsUiState.Error
                    }
                },
            )
        }
    }

    /**
     * Refreshes the suggestions count/content after a successful send without disrupting
     * the chat screen. Per spec this refresh is non-blocking and any failure is ignored,
     * leaving the previously loaded suggestions state in place.
     */
    private fun refreshSuggestionsQuietly() {
        viewModelScope.launch {
            chatRepository.getSuggestions(conversationId).fold(
                onSuccess = { result ->
                    _suggestionsState.value = SuggestionsUiState.Loaded(
                        analyzedAt = result.analyzedAt,
                        suggestions = result.suggestions,
                    )
                },
                onFailure = {
                    // Quiet refresh: failures are ignored, prior suggestions state is kept.
                },
            )
        }
    }

    fun retry() {
        loadConversation()
    }
}
