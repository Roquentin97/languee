package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.CreateDeckRequest
import com.example.langueedroid.core.network.dto.DeckResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface DecksApi {
    @GET("/api/v1/decks")
    suspend fun getDecks(): Response<List<DeckResponseDto>>

    @POST("/api/v1/decks")
    suspend fun createDeck(
        @Body body: CreateDeckRequest,
    ): Response<DeckResponseDto>

    @GET("/api/v1/decks/{id}")
    suspend fun getDeckById(
        @Path("id") id: String,
    ): Response<DeckResponseDto>
}
