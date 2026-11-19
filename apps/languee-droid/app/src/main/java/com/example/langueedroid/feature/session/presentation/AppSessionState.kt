package com.example.langueedroid.feature.session.presentation

import com.example.langueedroid.core.domain.RemoteFailureKind

sealed class AppSessionState {
    object CheckingSession : AppSessionState()

    object Unauthorized : AppSessionState()

    data class AuthenticationRequired(
        val userId: String,
        val userEmail: String,
        val reason: AuthenticationRequiredReason,
        val keepMainScreen: Boolean = false,
    ) : AppSessionState()

    enum class AuthenticationRequiredReason { SESSION_EXPIRED, REFRESH_UNAVAILABLE }

    data class SessionCheckFailed(
        val userId: String,
        val userEmail: String,
        val failureKind: RemoteFailureKind,
    ) : AppSessionState()

    data class Authorized(
        val userId: String,
        val userEmail: String,
    ) : AppSessionState()

    data class AuthorizedPendingAnkiSetup(
        val userId: String,
        val userEmail: String,
    ) : AppSessionState()
}
