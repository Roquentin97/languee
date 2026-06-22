package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.dto.LoginRequest
import com.example.langueedroid.core.network.dto.LogoutRequest
import com.example.langueedroid.core.network.dto.RefreshRequest
import com.example.langueedroid.core.network.dto.RegisterRequest

class AuthRepository(
    private val authApi: AuthApi,
    private val sessionStore: AuthSessionStore,
) {

    suspend fun login(email: String, password: String): Result<AuthSession> =
        runCatching {
            val response = authApi.login(LoginRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val session = AuthSession(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                    sessionId = body.sessionId,
                    userId = body.user.id,
                    userEmail = body.user.email,
                )
                sessionStore.save(session)
                session
            } else {
                throw RuntimeException("Login failed: HTTP ${response.code()}")
            }
        }

    suspend fun register(email: String, password: String): Result<AuthSession> =
        runCatching {
            val response = authApi.register(RegisterRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val session = AuthSession(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                    sessionId = body.sessionId,
                    userId = body.user.id,
                    userEmail = body.user.email,
                )
                sessionStore.save(session)
                session
            } else {
                throw RuntimeException("Registration failed: HTTP ${response.code()}")
            }
        }

    suspend fun refreshSession(): Result<AuthSession> =
        runCatching {
            val stored = sessionStore.read()
                ?: throw RuntimeException("No stored session to refresh")

            val response = authApi.refresh(
                RefreshRequest(
                    refreshToken = stored.refreshToken,
                    sessionId = stored.sessionId,
                ),
            )
            val body = response.body()
            if (response.isSuccessful && body != null) {
                sessionStore.updateTokens(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                    sessionId = body.sessionId,
                )
                AuthSession(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                    sessionId = body.sessionId,
                    userId = stored.userId,
                    userEmail = stored.userEmail,
                )
            } else {
                sessionStore.clear()
                throw RuntimeException("Token refresh failed: HTTP ${response.code()}")
            }
        }.onFailure { error ->
            // Clear the session on all failures except when there was no stored session to begin with.
            if (error.message?.startsWith("No stored session") == true) {
                // Nothing to clear.
            } else {
                sessionStore.clear()
            }
        }

    suspend fun logout(): Result<Unit> =
        runCatching {
            val stored = sessionStore.read()
            if (stored != null) {
                runCatching {
                    authApi.logout(
                        bearer = "Bearer ${stored.accessToken}",
                        body = LogoutRequest(
                            refreshToken = stored.refreshToken,
                            sessionId = stored.sessionId,
                        ),
                    )
                }
            }
            sessionStore.clear()
        }
}
