package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.CheckAnswerRequest
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.GradeRequest
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.ReviewQueueResponseDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ReviewsApi {
    @GET("/api/v1/reviews/summary")
    suspend fun getSummary(): Response<ReviewSummaryDto>

    @GET("/api/v1/reviews/queue")
    suspend fun getQueue(
        @Query("deckId") deckId: String? = null,
        @Query("limit") limit: Int? = null,
    ): Response<ReviewQueueResponseDto>

    @POST("/api/v1/reviews/{cardId}/answer")
    suspend fun checkAnswer(
        @Path("cardId") cardId: String,
        @Body body: CheckAnswerRequest,
    ): Response<CheckAnswerResponseDto>

    @POST("/api/v1/reviews/{cardId}/grade")
    suspend fun grade(
        @Path("cardId") cardId: String,
        @Body body: GradeRequest,
    ): Response<GradeResponseDto>
}
