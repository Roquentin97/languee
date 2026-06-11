package com.example.langueedroid.data.remote

import com.example.langueedroid.data.remote.dto.LoginRegisterResponse
import com.example.langueedroid.data.remote.dto.LoginRequest
import com.example.langueedroid.data.remote.dto.LogoutRequest
import com.example.langueedroid.data.remote.dto.RefreshRequest
import com.example.langueedroid.data.remote.dto.RefreshResponse
import com.example.langueedroid.data.remote.dto.RegisterRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface AuthApi {

    @POST("/auth/mobile/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginRegisterResponse>

    @POST("/auth/mobile/register")
    suspend fun register(@Body body: RegisterRequest): Response<LoginRegisterResponse>

    @POST("/auth/mobile/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<RefreshResponse>

    @POST("/auth/mobile/logout")
    suspend fun logout(
        @Header("Authorization") bearer: String,
        @Body body: LogoutRequest,
    ): Response<Unit>
}
