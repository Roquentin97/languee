package com.example.langueedroid.data.local

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
    val userId: String,
    val userEmail: String,
)
