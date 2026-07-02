package com.example.langueedroid.feature.chat.presentation

import com.example.langueedroid.core.domain.ChatMessage
import com.example.langueedroid.core.domain.ChatSuggestion

enum class ChatError { LOAD_FAILED }

sealed class ChatState {
    object Loading : ChatState()

    data class Loaded(
        val title: String?,
        val messages: List<ChatMessage>,
        val input: String,
        val isSending: Boolean,
        val sendFailed: Boolean = false,
    ) : ChatState()

    data class Error(val type: ChatError) : ChatState()
}

sealed class SuggestionsUiState {
    object Loading : SuggestionsUiState()
    data class Loaded(val analyzedAt: String?, val suggestions: List<ChatSuggestion>) : SuggestionsUiState()
    object Error : SuggestionsUiState()
}
