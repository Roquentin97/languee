package com.example.langueedroid.data.remote.dto

data class LoginRequest(val email: String, val password: String)

data class RegisterRequest(val email: String, val password: String)

data class RefreshRequest(val refreshToken: String, val sessionId: String)

data class LogoutRequest(val refreshToken: String, val sessionId: String)
