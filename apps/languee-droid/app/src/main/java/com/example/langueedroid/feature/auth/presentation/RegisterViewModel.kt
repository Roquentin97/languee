package com.example.langueedroid.feature.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.domain.AccountAlreadyExistsException
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.remoteFailureKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RegisterViewModel
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

        private val _confirmPassword = MutableStateFlow("")
        val confirmPassword: StateFlow<String> = _confirmPassword.asStateFlow()

        fun onEmailChange(value: String) {
            _email.value = value
        }

        fun onPasswordChange(value: String) {
            _password.value = value
        }

        fun onConfirmPasswordChange(value: String) {
            _confirmPassword.value = value
        }

        fun onRegisterClick() {
            if (_uiState.value is AuthUiState.Loading) return
            val email = _email.value.trim()
            val password = _password.value
            val confirmPassword = _confirmPassword.value
            if (email.isBlank() || password.isBlank() || confirmPassword.isBlank()) {
                _uiState.value = AuthUiState.Error(AuthUiError.REQUIRED_FIELDS)
                return
            }
            if (password != confirmPassword) {
                _uiState.value = AuthUiState.Error(AuthUiError.PASSWORDS_DO_NOT_MATCH)
                return
            }
            _uiState.value = AuthUiState.Loading
            viewModelScope.launch {
                val result = authRepository.register(email, password)
                val session = result.getOrNull()
                if (session != null) {
                    _uiState.value = AuthUiState.Success(session)
                } else {
                    _uiState.value = AuthUiState.Error(result.exceptionOrNull().toAuthUiError())
                }
            }
        }
    }

private fun Throwable?.toAuthUiError(): AuthUiError =
    when (this) {
        is AccountAlreadyExistsException -> AuthUiError.ACCOUNT_ALREADY_EXISTS
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
