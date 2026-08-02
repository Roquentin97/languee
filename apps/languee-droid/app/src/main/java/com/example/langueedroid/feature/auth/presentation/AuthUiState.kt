package com.example.langueedroid.feature.auth.presentation

import com.example.langueedroid.core.data.local.AuthSession

sealed class AuthUiState {
    object Idle : AuthUiState()

    object Loading : AuthUiState()

    data class Success(
        val session: AuthSession,
    ) : AuthUiState()

    data class Error(
        val message: String,
    ) : AuthUiState()
}
