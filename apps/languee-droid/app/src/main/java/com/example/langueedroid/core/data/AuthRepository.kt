package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.dto.LoginRequest
import com.example.langueedroid.core.network.dto.LogoutRequest
import com.example.langueedroid.core.network.dto.RefreshRequest
import com.example.langueedroid.core.network.dto.RegisterRequest
import com.example.langueedroid.core.telemetry.Logger

private class AuthHttpFailure(
    message: String,
) : RuntimeException(message)

class AuthRepository(
    private val authApi: AuthApi,
    private val sessionStore: AuthSessionStore,
    private val logger: Logger,
) {
    suspend fun login(
        email: String,
        password: String,
    ): Result<AuthSession> =
        try {
            val response = authApi.login(LoginRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val session =
                    AuthSession(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        sessionId = body.sessionId,
                        userId = body.user.id,
                        userEmail = body.user.email,
                    )
                sessionStore.save(session)
                logger.info("auth.login_succeeded")
                Result.success(session)
            } else {
                logger.warn("auth.login_failed", mapOf("http.status_code" to response.code().toString()))
                Result.failure(RuntimeException("Login failed: HTTP ${response.code()}"))
            }
        } catch (error: Throwable) {
            logger.error("auth.login_failed", error = error)
            Result.failure(error)
        }

    suspend fun register(
        email: String,
        password: String,
    ): Result<AuthSession> =
        try {
            val response = authApi.register(RegisterRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body != null) {
                val session =
                    AuthSession(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        sessionId = body.sessionId,
                        userId = body.user.id,
                        userEmail = body.user.email,
                    )
                sessionStore.save(session)
                logger.info("auth.registration_succeeded")
                Result.success(session)
            } else {
                logger.warn("auth.registration_failed", mapOf("http.status_code" to response.code().toString()))
                Result.failure(RuntimeException("Registration failed: HTTP ${response.code()}"))
            }
        } catch (error: Throwable) {
            logger.error("auth.registration_failed", error = error)
            Result.failure(error)
        }

    suspend fun refreshSession(): Result<AuthSession> =
        try {
            val stored =
                sessionStore.read()
                    ?: throw RuntimeException("No stored session to refresh")

            val response =
                authApi.refresh(
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
                logger.info("auth.session_refreshed")
                Result.success(
                    AuthSession(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        sessionId = body.sessionId,
                        userId = stored.userId,
                        userEmail = stored.userEmail,
                    ),
                )
            } else {
                logger.warn("auth.session_refresh_failed", mapOf("http.status_code" to response.code().toString()))
                sessionStore.clear()
                throw AuthHttpFailure("Token refresh failed: HTTP ${response.code()}")
            }
        } catch (error: Throwable) {
            if (error !is AuthHttpFailure) {
                logger.error("auth.session_refresh_failed", error = error)
            }
            // Clear the session on all failures except when there was no stored session to begin with.
            if (error.message?.startsWith("No stored session") == true) {
                // Nothing to clear.
            } else {
                sessionStore.clear()
            }
            Result.failure(error)
        }

    suspend fun logout(): Result<Unit> =
        runCatching {
            val stored = sessionStore.read()
            if (stored != null) {
                runCatching {
                    val response =
                        authApi.logout(
                            bearer = "Bearer ${stored.accessToken}",
                            body =
                                LogoutRequest(
                                    refreshToken = stored.refreshToken,
                                    sessionId = stored.sessionId,
                                ),
                        )
                    if (!response.isSuccessful) {
                        logger.warn("auth.logout_failed", mapOf("http.status_code" to response.code().toString()))
                    }
                }.onFailure { error -> logger.warn("auth.logout_failed", error = error) }
            }
            sessionStore.clear()
            logger.info("auth.session_cleared")
        }
}
