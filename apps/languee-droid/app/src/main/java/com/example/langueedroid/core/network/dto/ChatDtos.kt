package com.example.langueedroid.core.network.dto

data class CreateConversationRequest(
    val title: String? = null,
)

data class ConversationResponseDto(
    val id: String,
    val title: String?,
    val createdAt: String,
    val updatedAt: String,
    val messageCount: Int,
)

data class ConversationSummaryDto(
    val id: String,
    val title: String?,
    val createdAt: String,
    val updatedAt: String,
    val messageCount: Int,
    val lastMessagePreview: String?,
)

data class ConversationListResponseDto(
    val conversations: List<ConversationSummaryDto>,
)

data class ChatMessageDto(
    val id: String,
    val role: String,
    val content: String,
    val createdAt: String,
)

data class ConversationDetailResponseDto(
    val id: String,
    val title: String?,
    val createdAt: String,
    val messages: List<ChatMessageDto>,
)

data class SendMessageRequest(
    val content: String,
)

data class SendMessageResponseDto(
    val userMessage: ChatMessageDto,
    val assistantMessage: ChatMessageDto,
)

/**
 * Suggestion payload shape is only pinned by the contract for the `overused_word` type.
 * All fields are nullable so parsing tolerates missing fields for that type and unrelated
 * shapes carried by other suggestion types.
 */
data class SuggestionPayloadDto(
    val word: String? = null,
    val count: Int? = null,
    val synonyms: List<String>? = null,
)

data class ChatSuggestionDto(
    val id: String,
    val type: String,
    val title: String,
    val detail: String,
    val payload: SuggestionPayloadDto?,
    val createdAt: String,
)

data class SuggestionsResponseDto(
    val suggestions: List<ChatSuggestionDto>,
    val analyzedAt: String?,
)

data class ChatProgressTotalsDto(
    val suggestionsRaised: Int,
    val suggestionsResolved: Int,
    val resolutionRate: Double?,
    val userMessages: Int,
    val activeConversations: Int,
)

data class ChatProgressByTypeDto(
    val type: String,
    val raised: Int,
    val resolved: Int,
)

data class ChatProgressWeekDto(
    val weekStart: String,
    val raised: Int,
    val resolved: Int,
    val userMessages: Int,
)

data class ChatProgressResponseDto(
    val totals: ChatProgressTotalsDto,
    val byType: List<ChatProgressByTypeDto>,
    val weeks: List<ChatProgressWeekDto>,
    val computedAt: String?,
)
