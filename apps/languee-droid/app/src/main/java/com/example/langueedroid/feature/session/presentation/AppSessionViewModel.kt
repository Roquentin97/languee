package com.example.langueedroid.feature.session.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.remoteFailureKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AppSessionViewModel
    @Inject
    constructor(
        private val authRepository: AuthRepository,
        private val sessionStore: AuthSessionStore,
        private val prefsStore: AnkiDroidPreferencesStore,
    ) : ViewModel() {
        private val _sessionState = MutableStateFlow<AppSessionState>(AppSessionState.CheckingSession)
        val sessionState: StateFlow<AppSessionState> = _sessionState.asStateFlow()

        private val _logoutInProgress = MutableStateFlow(false)
        val logoutInProgress: StateFlow<Boolean> = _logoutInProgress.asStateFlow()

        init {
            checkSession()
        }

        fun retrySessionCheck() {
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
                    transitionToAuthorized(refreshed.userId, refreshed.userEmail)
                } else {
                    val error = result.exceptionOrNull()
                    _sessionState.value =
                        if (error is UnauthorizedException) {
                            AppSessionState.AuthenticationRequired(
                                userId = stored.userId,
                                userEmail = stored.userEmail,
                                reason = AppSessionState.AuthenticationRequiredReason.SESSION_EXPIRED,
                            )
                        } else {
                            AppSessionState.SessionCheckFailed(
                                userId = stored.userId,
                                userEmail = stored.userEmail,
                                failureKind = error?.remoteFailureKind() ?: RemoteFailureKind.UNEXPECTED,
                            )
                        }
                }
            }
        }

        private suspend fun transitionToAuthorized(
            userId: String,
            userEmail: String,
        ) {
            val ankiPrefs = prefsStore.read()
            _sessionState.value =
                if (!ankiPrefs.setupCompleted) {
                    AppSessionState.AuthorizedPendingAnkiSetup(userId = userId, userEmail = userEmail)
                } else {
                    AppSessionState.Authorized(userId = userId, userEmail = userEmail)
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
            viewModelScope.launch {
                transitionToAuthorized(session.userId, session.userEmail)
            }
        }

        fun onSessionExpired(
            userId: String,
            userEmail: String,
        ) {
            _sessionState.value =
                AppSessionState.AuthenticationRequired(
                    userId = userId,
                    userEmail = userEmail,
                    reason = AppSessionState.AuthenticationRequiredReason.SESSION_EXPIRED,
                    keepMainScreen = true,
                )
        }

        fun onSignInAfterRefreshFailure(
            userId: String,
            userEmail: String,
        ) {
            _sessionState.value =
                AppSessionState.AuthenticationRequired(
                    userId = userId,
                    userEmail = userEmail,
                    reason = AppSessionState.AuthenticationRequiredReason.REFRESH_UNAVAILABLE,
                )
        }

        fun onAnkiSetupFinished() {
            val current = _sessionState.value
            viewModelScope.launch {
                val prefs = prefsStore.read()
                prefsStore.save(prefs.copy(setupCompleted = true))
                val (userId, userEmail) =
                    when (current) {
                        is AppSessionState.AuthorizedPendingAnkiSetup -> Pair(current.userId, current.userEmail)
                        is AppSessionState.Authorized -> Pair(current.userId, current.userEmail)
                        else -> return@launch
                    }
                _sessionState.value = AppSessionState.Authorized(userId = userId, userEmail = userEmail)
            }
        }
    }
