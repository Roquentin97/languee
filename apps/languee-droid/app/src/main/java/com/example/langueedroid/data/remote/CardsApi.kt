package com.example.langueedroid.data.remote

import com.example.langueedroid.data.remote.dto.CardResponseDto
import com.example.langueedroid.data.remote.dto.CreateCardRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface CardsApi {

    @POST("/api/v1/cards")
    suspend fun createCard(@Body body: CreateCardRequest): Response<CardResponseDto>
}
