package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CreateCardRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface CardsApi {
    @POST("/api/v1/cards")
    suspend fun createCard(
        @Body body: CreateCardRequest,
    ): Response<CardResponseDto>

    @GET("/api/v1/cards/{id}")
    suspend fun getCard(
        @Path("id") id: String,
    ): Response<CardResponseDto>

    @GET("/api/v1/cards")
    suspend fun listCards(
        @Query("deckId") deckId: String,
    ): Response<List<CardResponseDto>>
}
