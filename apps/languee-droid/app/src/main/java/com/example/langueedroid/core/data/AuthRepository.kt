package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.domain.AccountMismatchException
import com.example.langueedroid.core.domain.InvalidCredentialsException
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.dto.LoginRequest
import com.example.langueedroid.core.network.dto.LogoutRequest
import com.example.langueedroid.core.network.dto.RefreshRequest
import com.example.langueedroid.core.network.dto.RegisterRequest
import com.example.langueedroid.core.telemetry.Logger
import kotlinx.coroutines.CancellationException

private class MissingStoredSessionException : Exception("No stored session")

class AuthRepository(
    private val authApi: AuthApi,
    private val sessionStore: AuthSessionStore,
    private val logger: Logger,
) {
    suspend fun login(
        email: String,
        password: String,
    ): Result<AuthSession> = login(email, password, requiredUserId = null)

    /** Keeps recovery sign-in bound to the account whose local work is still on screen. */
    suspend fun login(
        email: String,
        password: String,
        requiredUserId: String?,
    ): Result<AuthSession> {
        val result =
            runCatchingCancellable {
                val response = authApi.login(LoginRequest(email, password))
                response.throwIfUnsuccessful(ApiOperation.AUTH_LOGIN)
                val body = response.bodyOrThrow(ApiOperation.AUTH_LOGIN)
                val session =
                    AuthSession(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        sessionId = body.sessionId,
                        userId = body.user.id,
                        userEmail = body.user.email,
                    )
                if (requiredUserId != null && session.userId != requiredUserId) {
                    throw AccountMismatchException()
                }
                sessionStore.save(session)
                logger.info("auth.login_succeeded")
                session
            }
        result.exceptionOrNull()?.let { logAuthFailure("auth.login_failed", it) }
        return result
    }

    suspend fun register(
        email: String,
        password: String,
    ): Result<AuthSession> {
        val result =
            runCatchingCancellable {
                val response = authApi.register(RegisterRequest(email, password))
                response.throwIfUnsuccessful(ApiOperation.AUTH_REGISTER)
                val body = response.bodyOrThrow(ApiOperation.AUTH_REGISTER)
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
                session
            }
        result.exceptionOrNull()?.let { logAuthFailure("auth.registration_failed", it) }
        return result
    }

    suspend fun refreshSession(): Result<AuthSession> {
        val result =
            runCatchingCancellable {
                val stored = sessionStore.read() ?: throw MissingStoredSessionException()
                val response =
                    authApi.refresh(
                        RefreshRequest(
                            refreshToken = stored.refreshToken,
                            sessionId = stored.sessionId,
                        ),
                    )
                try {
                    response.throwIfUnsuccessful(ApiOperation.AUTH_REFRESH)
                } catch (error: UnauthorizedException) {
                    clearCredentialsForRecovery(stored.userId)
                    throw error
                }
                val body =
                    try {
                        response.bodyOrThrow(ApiOperation.AUTH_REFRESH)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        // A successful refresh may already have rotated the server-side token.
                        // Without the new pair, the stored refresh token cannot be retried safely.
                        clearCredentialsForRecovery(stored.userId)
                        throw error
                    }
                try {
                    sessionStore.updateTokens(
                        accessToken = body.accessToken,
                        refreshToken = body.refreshToken,
                        sessionId = body.sessionId,
                    )
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    // The backend rotates refresh tokens on success. The old token can no longer
                    // safely be retried if persisting the new pair fails.
                    clearCredentialsForRecovery(stored.userId)
                    throw error
                }
                logger.info("auth.session_refreshed")
                AuthSession(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                    sessionId = body.sessionId,
                    userId = stored.userId,
                    userEmail = stored.userEmail,
                )
            }
        result.exceptionOrNull()?.let { error ->
            when (error) {
                is MissingStoredSessionException -> Unit
                is UnauthorizedException -> logger.warn("auth.session_refresh_failed", mapOf("http.status_code" to "401"))
                else -> logger.error("auth.session_refresh_failed", error = error)
            }
        }
        return result
    }

    suspend fun logout(): Result<Unit> =
        runCatchingCancellable {
            val stored = sessionStore.read()
            if (stored != null) {
                try {
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
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    logger.warn("auth.logout_failed", error = error)
                }
            }
            sessionStore.clear()
            logger.info("auth.session_cleared")
        }

    private fun logAuthFailure(
        event: String,
        error: Throwable,
    ) {
        when (error) {
            is InvalidCredentialsException -> logger.warn(event, mapOf("http.status_code" to "401"))
            is AccountMismatchException -> logger.warn(event, mapOf("auth.account_mismatch" to "true"))
            is RemoteOperationFailureException ->
                logger.warn(event, mapOf("http.status_code" to error.statusCode?.toString().orEmpty()))
            else -> logger.error(event, error = error)
        }
    }

    private fun clearCredentialsForRecovery(userId: String) {
        if (sessionStore.requireReauthentication(userId)) {
            sessionStore.clearCredentials()
        }
    }
}
