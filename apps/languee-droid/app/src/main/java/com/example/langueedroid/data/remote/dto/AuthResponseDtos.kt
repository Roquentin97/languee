package com.example.langueedroid.data.remote.dto

data class AuthUserDto(val id: String, val email: String)

data class LoginRegisterResponse(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
    val user: AuthUserDto,
)

data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
)
