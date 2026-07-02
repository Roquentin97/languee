package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.ChatMessage
import com.example.langueedroid.core.domain.ChatProgress
import com.example.langueedroid.core.domain.Conversation
import com.example.langueedroid.core.domain.ConversationSummary
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.SuggestionsResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.ChatApi
import com.example.langueedroid.core.network.dto.CreateConversationRequest
import com.example.langueedroid.core.network.dto.SendMessageRequest

private const val TAG = "ChatRepository"

class ChatRepository(
    private val chatApi: ChatApi,
) {

    suspend fun createConversation(title: String? = null): Result<ConversationSummary> = runCatching {
        val response = chatApi.createConversation(CreateConversationRequest(title = title))
        when {
            response.isSuccessful -> {
                val body = response.body()?.toDomain()
                    ?: throw Exception("Empty response body from create conversation")
                Log.i(TAG, "[event=chat.conversation_created method=createConversation] conversation created | id=${body.id}")
                body
            }
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to create conversation: HTTP ${response.code()}")
        }
    }

    suspend fun getConversations(): Result<List<ConversationSummary>> = runCatching {
        val response = chatApi.getConversations()
        when {
            response.isSuccessful -> {
                val conversations = response.body()?.conversations?.map { it.toDomain() } ?: emptyList()
                Log.i(TAG, "[event=chat.conversations_loaded method=getConversations] conversations loaded | count=${conversations.size}")
                conversations
            }
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to fetch conversations: HTTP ${response.code()}")
        }
    }

    suspend fun getConversation(conversationId: String): Result<Conversation> = runCatching {
        val response = chatApi.getConversation(conversationId)
        when {
            response.isSuccessful -> {
                val body = response.body()?.toDomain()
                    ?: throw Exception("Empty response body from get conversation")
                Log.i(TAG, "[event=chat.conversation_loaded method=getConversation] conversation loaded | id=$conversationId messageCount=${body.messages.size}")
                body
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            else -> throw Exception("Failed to fetch conversation: HTTP ${response.code()}")
        }
    }

    suspend fun sendMessage(conversationId: String, content: String): Result<Pair<ChatMessage, ChatMessage>> = runCatching {
        val response = chatApi.sendMessage(conversationId, SendMessageRequest(content = content))
        when {
            response.isSuccessful -> {
                val body = response.body()
                    ?: throw Exception("Empty response body from send message")
                Log.i(TAG, "[event=chat.message_sent method=sendMessage] message sent | conversationId=$conversationId")
                body.userMessage.toDomain() to body.assistantMessage.toDomain()
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            else -> throw Exception("Failed to send message: HTTP ${response.code()}")
        }
    }

    suspend fun getSuggestions(conversationId: String): Result<SuggestionsResult> = runCatching {
        val response = chatApi.getSuggestions(conversationId)
        when {
            response.isSuccessful -> {
                val body = response.body()?.toDomain()
                    ?: throw Exception("Empty response body from get suggestions")
                Log.i(TAG, "[event=chat.suggestions_loaded method=getSuggestions] suggestions loaded | conversationId=$conversationId count=${body.suggestions.size}")
                body
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            else -> throw Exception("Failed to fetch suggestions: HTTP ${response.code()}")
        }
    }

    suspend fun progress(): Result<ChatProgress> = runCatching {
        val response = chatApi.getProgress()
        when {
            response.isSuccessful -> {
                val body = response.body()?.toDomain()
                    ?: throw Exception("Empty response body from get progress")
                Log.i(
                    TAG,
                    "[event=chat.progress_loaded method=progress] progress loaded | " +
                        "raised=${body.totals.suggestionsRaised} resolved=${body.totals.suggestionsResolved}",
                )
                body
            }
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to fetch progress: HTTP ${response.code()}")
        }
    }
}
