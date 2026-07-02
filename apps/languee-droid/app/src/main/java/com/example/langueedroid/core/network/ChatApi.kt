package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.ConversationDetailResponseDto
import com.example.langueedroid.core.network.dto.ConversationListResponseDto
import com.example.langueedroid.core.network.dto.ConversationResponseDto
import com.example.langueedroid.core.network.dto.CreateConversationRequest
import com.example.langueedroid.core.network.dto.SendMessageRequest
import com.example.langueedroid.core.network.dto.SendMessageResponseDto
import com.example.langueedroid.core.network.dto.SuggestionsResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface ChatApi {

    @POST("/api/v1/chat/conversations")
    suspend fun createConversation(@Body body: CreateConversationRequest): Response<ConversationResponseDto>

    @GET("/api/v1/chat/conversations")
    suspend fun getConversations(): Response<ConversationListResponseDto>

    @GET("/api/v1/chat/conversations/{id}")
    suspend fun getConversation(@Path("id") id: String): Response<ConversationDetailResponseDto>

    @POST("/api/v1/chat/conversations/{id}/messages")
    suspend fun sendMessage(
        @Path("id") id: String,
        @Body body: SendMessageRequest,
    ): Response<SendMessageResponseDto>

    @GET("/api/v1/chat/conversations/{id}/suggestions")
    suspend fun getSuggestions(@Path("id") id: String): Response<SuggestionsResponseDto>
}
