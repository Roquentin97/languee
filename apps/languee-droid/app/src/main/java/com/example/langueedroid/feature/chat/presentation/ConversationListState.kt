package com.example.langueedroid.feature.chat.presentation

import com.example.langueedroid.core.domain.ConversationSummary

enum class ConversationListError { LOAD_FAILED, CREATE_FAILED }

sealed class ConversationListState {
    object Loading : ConversationListState()
    data class Success(val conversations: List<ConversationSummary>) : ConversationListState()
    object Empty : ConversationListState()
    data class Error(val type: ConversationListError) : ConversationListState()
}
