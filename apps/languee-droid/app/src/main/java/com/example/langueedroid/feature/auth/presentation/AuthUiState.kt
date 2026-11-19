package com.example.langueedroid.feature.auth.presentation

import com.example.langueedroid.core.data.local.AuthSession

sealed class AuthUiState {
    object Idle : AuthUiState()

    object Loading : AuthUiState()

    data class Success(
        val session: AuthSession,
    ) : AuthUiState()

    data class Error(
        val type: AuthUiError,
    ) : AuthUiState()
}

enum class AuthUiError {
    REQUIRED_FIELDS,
    PASSWORDS_DO_NOT_MATCH,
    INVALID_CREDENTIALS,
    ACCOUNT_ALREADY_EXISTS,
    CONNECTION,
    RATE_LIMITED,
    SERVICE_UNAVAILABLE,
    REQUEST_REJECTED,
    FORBIDDEN,
    UNEXPECTED,
}
