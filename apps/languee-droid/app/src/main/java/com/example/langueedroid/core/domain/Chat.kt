package com.example.langueedroid.core.domain

enum class Role { USER, ASSISTANT }

enum class SuggestionType { OVERUSED_WORD, GRAMMAR, STYLE }

data class ConversationSummary(
    val id: String,
    val title: String?,
    val createdAt: String,
    val updatedAt: String,
    val messageCount: Int,
    val lastMessagePreview: String?,
)

data class ChatMessage(
    val id: String,
    val role: Role,
    val content: String,
    val createdAt: String,
)

data class Conversation(
    val id: String,
    val title: String?,
    val createdAt: String,
    val messages: List<ChatMessage>,
)

data class OverusedWordPayload(
    val word: String,
    val count: Int,
    val synonyms: List<String>,
)

data class ChatSuggestion(
    val id: String,
    val type: SuggestionType,
    val title: String,
    val detail: String,
    val overusedWordPayload: OverusedWordPayload?,
    val createdAt: String,
)

data class SuggestionsResult(
    val analyzedAt: String?,
    val suggestions: List<ChatSuggestion>,
)

data class ProgressTotals(
    val suggestionsRaised: Int,
    val suggestionsResolved: Int,
    val resolutionRate: Double?,
    val userMessages: Int,
    val activeConversations: Int,
)

data class ProgressByType(
    val type: SuggestionType,
    val raised: Int,
    val resolved: Int,
)

data class ProgressWeek(
    val weekStart: String,
    val raised: Int,
    val resolved: Int,
    val userMessages: Int,
)

data class ChatProgress(
    val totals: ProgressTotals,
    val byType: List<ProgressByType>,
    val weeks: List<ProgressWeek>,
    val computedAt: String?,
)
