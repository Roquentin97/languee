package com.example.langueedroid.feature.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.domain.InvalidCredentialsException
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.remoteFailureKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel
    @Inject
    constructor(
        private val authRepository: AuthRepository,
    ) : ViewModel() {
        private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
        val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

        private val _email = MutableStateFlow("")
        val email: StateFlow<String> = _email.asStateFlow()

        private val _password = MutableStateFlow("")
        val password: StateFlow<String> = _password.asStateFlow()

        private val _authSuccessEvent = MutableSharedFlow<AuthSession>(extraBufferCapacity = 1)
        val authSuccessEvent: SharedFlow<AuthSession> = _authSuccessEvent.asSharedFlow()

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
                _uiState.value = AuthUiState.Error(AuthUiError.REQUIRED_FIELDS)
                return
            }
            _uiState.value = AuthUiState.Loading
            viewModelScope.launch {
                val result = authRepository.login(email, password)
                val session = result.getOrNull()
                if (session != null) {
                    _uiState.value = AuthUiState.Idle
                    _authSuccessEvent.tryEmit(session)
                } else {
                    _uiState.value = AuthUiState.Error(result.exceptionOrNull().toAuthUiError())
                }
            }
        }
    }

private fun Throwable?.toAuthUiError(): AuthUiError =
    when (this) {
        is InvalidCredentialsException -> AuthUiError.INVALID_CREDENTIALS
        else ->
            when (this?.remoteFailureKind()) {
                RemoteFailureKind.CONNECTION -> AuthUiError.CONNECTION
                RemoteFailureKind.RATE_LIMITED -> AuthUiError.RATE_LIMITED
                RemoteFailureKind.SERVICE_UNAVAILABLE -> AuthUiError.SERVICE_UNAVAILABLE
                RemoteFailureKind.BAD_REQUEST -> AuthUiError.REQUEST_REJECTED
                RemoteFailureKind.FORBIDDEN -> AuthUiError.FORBIDDEN
                else -> AuthUiError.UNEXPECTED
            }
    }
