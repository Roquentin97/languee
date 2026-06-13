package com.example.langueedroid.presentation.auth

import com.example.langueedroid.data.local.AuthSession

sealed class AuthUiState {
    object Idle : AuthUiState()
    object Loading : AuthUiState()
    data class Success(val session: AuthSession) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}
