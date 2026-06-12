package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSession
import com.example.langueedroid.data.local.AuthSessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AppSessionViewModel(
    private val authRepository: AuthRepository,
    private val sessionStore: AuthSessionStore,
) : ViewModel() {

    private val _sessionState = MutableStateFlow<AppSessionState>(AppSessionState.CheckingSession)
    val sessionState: StateFlow<AppSessionState> = _sessionState.asStateFlow()

    private val _logoutInProgress = MutableStateFlow(false)
    val logoutInProgress: StateFlow<Boolean> = _logoutInProgress.asStateFlow()

    init {
        checkSession()
    }

    private fun checkSession() {
        viewModelScope.launch {
            _sessionState.value = AppSessionState.CheckingSession
            val stored = sessionStore.read()
            if (stored == null) {
                sessionStore.clear()
                _sessionState.value = AppSessionState.Unauthorized
                return@launch
            }
            val result = authRepository.refreshSession()
            val refreshed = result.getOrNull()
            if (refreshed != null) {
                _sessionState.value = AppSessionState.Authorized(
                    userId = refreshed.userId,
                    userEmail = refreshed.userEmail,
                )
            } else {
                _sessionState.value = AppSessionState.Unauthorized
            }
        }
    }

    fun onLogout() {
        if (_logoutInProgress.value) return
        viewModelScope.launch {
            _logoutInProgress.value = true
            authRepository.logout()
            _sessionState.value = AppSessionState.Unauthorized
            _logoutInProgress.value = false
        }
    }

    fun onAuthSuccess(session: AuthSession) {
        _sessionState.value = AppSessionState.Authorized(
            userId = session.userId,
            userEmail = session.userEmail,
        )
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val sessionStore: AuthSessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(AppSessionViewModel::class.java)) {
                return AppSessionViewModel(authRepository, sessionStore) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
