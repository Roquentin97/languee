package com.example.langueedroid.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val onAuthSuccess: (AuthSession) -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    fun onEmailChange(value: String) {
        _email.value = value
    }

    fun onPasswordChange(value: String) {
        _password.value = value
    }

    fun onLoginClick() {
        if (_uiState.value is AuthUiState.Loading) return
        val email = _email.value.trim()
        val password = _password.value
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = AuthUiState.Error("Email and password must not be blank")
            return
        }
        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            val result = authRepository.login(email, password)
            val session = result.getOrNull()
            if (session != null) {
                _uiState.value = AuthUiState.Idle
                onAuthSuccess(session)
            } else {
                _uiState.value = AuthUiState.Error(
                    result.exceptionOrNull()?.message ?: "Login failed",
                )
            }
        }
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val onAuthSuccess: (AuthSession) -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(LoginViewModel::class.java)) {
                return LoginViewModel(authRepository, onAuthSuccess) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
