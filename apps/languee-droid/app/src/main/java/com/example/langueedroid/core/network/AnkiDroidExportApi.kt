package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.AnkiDroidExportResponseDto
import com.example.langueedroid.core.network.dto.CardSummaryDto
import com.example.langueedroid.core.network.dto.RecordAttemptRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface AnkiDroidExportApi {
    @POST("/api/v1/cards/{cardId}/ankidroid-exports")
    suspend fun createOrGetExport(
        @Path("cardId") cardId: String,
    ): Response<AnkiDroidExportResponseDto>

    @GET("/api/v1/ankidroid-exports/{id}")
    suspend fun getExport(
        @Path("id") id: String,
    ): Response<AnkiDroidExportResponseDto>

    @POST("/api/v1/ankidroid-exports/{id}/attempts")
    suspend fun recordAttempt(
        @Path("id") exportId: String,
        @Body body: RecordAttemptRequest,
    ): Response<Unit>

    @GET("/api/v1/cards")
    suspend fun getCardsWithExportStatus(
        @Query("ankiDroidExportStatus") status: String,
        @Query("deckId") deckId: String? = null,
    ): Response<List<CardSummaryDto>>
}
