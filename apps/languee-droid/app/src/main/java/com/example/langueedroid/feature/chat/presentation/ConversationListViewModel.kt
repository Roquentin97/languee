package com.example.langueedroid.feature.chat.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ConversationListViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ConversationListState>(ConversationListState.Loading)
    val state: StateFlow<ConversationListState> = _state.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    /** Emits the id of a freshly created conversation so the UI can navigate to its thread. */
    private val _conversationCreated = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val conversationCreated: SharedFlow<String> = _conversationCreated.asSharedFlow()

    private var isCreating = false

    init {
        loadConversations()
    }

    fun loadConversations() {
        _state.value = ConversationListState.Loading
        viewModelScope.launch {
            chatRepository.getConversations().fold(
                onSuccess = { conversations ->
                    _state.value = if (conversations.isEmpty()) {
                        ConversationListState.Empty
                    } else {
                        ConversationListState.Success(conversations)
                    }
                },
                onFailure = { error -> handleFailure(error, ConversationListError.LOAD_FAILED) },
            )
        }
    }

    fun createConversation() {
        if (isCreating) return
        isCreating = true
        viewModelScope.launch {
            chatRepository.createConversation().fold(
                onSuccess = { summary -> _conversationCreated.tryEmit(summary.id) },
                onFailure = { error -> handleFailure(error, ConversationListError.CREATE_FAILED) },
            )
            isCreating = false
        }
    }

    fun retry() {
        loadConversations()
    }

    private fun handleFailure(error: Throwable, type: ConversationListError) {
        if (error is UnauthorizedException) {
            _unauthorizedEvent.tryEmit(Unit)
        } else {
            _state.value = ConversationListState.Error(type)
        }
    }
}
