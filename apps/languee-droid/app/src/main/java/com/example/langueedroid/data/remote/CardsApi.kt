package com.example.langueedroid.data.remote

import com.example.langueedroid.data.remote.dto.CardResponseDto
import com.example.langueedroid.data.remote.dto.CreateCardRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface CardsApi {

    @POST("/api/v1/cards")
    suspend fun createCard(@Body body: CreateCardRequest): Response<CardResponseDto>

    @GET("/api/v1/cards/{id}")
    suspend fun getCard(@Path("id") id: String): Response<CardResponseDto>
}
