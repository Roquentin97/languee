package com.example.langueedroid.data.remote

import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSession
import com.example.langueedroid.data.local.AuthSessionStore
import kotlinx.coroutines.runBlocking
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class AuthAuthenticatorTest {

    private lateinit var sessionStore: AuthSessionStore
    private lateinit var authRepository: AuthRepository
    private lateinit var authenticator: AuthAuthenticator

    @Before
    fun setUp() {
        sessionStore = mock()
        authRepository = mock()
        authenticator = AuthAuthenticator(
            sessionStore = sessionStore,
            repositoryProvider = { authRepository },
        )
    }

    // -----------------------------------------------------------------------
    // Infinite-loop guard
    // -----------------------------------------------------------------------

    @Test
    fun `returns null when prior response was also 401`() {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)

        val priorResponse = buildResponse(code = 401, token = stored.accessToken, prior = null)
        val outerResponse = buildResponse(code = 401, token = stored.accessToken, prior = priorResponse)

        val result = authenticator.authenticate(route = null, response = outerResponse)

        assertNull(result)
    }

    // -----------------------------------------------------------------------
    // No stored session — stop immediately
    // -----------------------------------------------------------------------

    @Test
    fun `returns null when no session is stored`() {
        whenever(sessionStore.read()).thenReturn(null)

        val response = buildResponse(code = 401, token = "someToken", prior = null)
        val result = authenticator.authenticate(route = null, response = response)

        assertNull(result)
    }

    // -----------------------------------------------------------------------
    // Concurrent 401 guard (edge case 9)
    //
    // The stored token has already been rotated by a concurrent request, so the
    // failed request carries a stale token. The authenticator must skip the
    // refresh call and retry directly with the current stored token.
    // -----------------------------------------------------------------------

    @Test
    fun `skips refresh and retries with stored token when tokens differ (concurrent guard)`() {
        val stored = storedSession(accessToken = "newToken")
        whenever(sessionStore.read()).thenReturn(stored)

        // The failed request was sent with the OLD token before rotation.
        val response = buildResponse(code = 401, token = "oldToken", prior = null)
        val result = authenticator.authenticate(route = null, response = response)

        assertNotNull(result)
        assertEquals("Bearer newToken", result!!.header("Authorization"))
        // refresh must NOT be called — the guard short-circuited
        runBlocking { verify(authRepository, never()).refreshSession() }
    }

    // -----------------------------------------------------------------------
    // Normal refresh path — tokens match, refresh succeeds
    // -----------------------------------------------------------------------

    @Test
    fun `calls refresh and retries with new token when stored token matches failed request`() {
        val stored = storedSession(accessToken = "currentToken")
        whenever(sessionStore.read()).thenReturn(stored)

        val refreshed = stored.copy(accessToken = "rotatedToken")
        // refreshSession is a suspend fun; mockito-kotlin stubs it with runBlocking.
        runBlocking {
            whenever(authRepository.refreshSession()).thenReturn(Result.success(refreshed))
        }

        val response = buildResponse(code = 401, token = "currentToken", prior = null)
        val result = authenticator.authenticate(route = null, response = response)

        assertNotNull(result)
        assertEquals("Bearer rotatedToken", result!!.header("Authorization"))
    }

    // -----------------------------------------------------------------------
    // Normal refresh path — tokens match, refresh fails → clear and return null
    // -----------------------------------------------------------------------

    @Test
    fun `clears session and returns null when refresh fails`() {
        val stored = storedSession(accessToken = "currentToken")
        whenever(sessionStore.read()).thenReturn(stored)

        runBlocking {
            whenever(authRepository.refreshSession()).thenReturn(
                Result.failure(RuntimeException("Token refresh failed: HTTP 401")),
            )
        }

        val response = buildResponse(code = 401, token = "currentToken", prior = null)
        val result = authenticator.authenticate(route = null, response = response)

        assertNull(result)
        verify(sessionStore).clear()
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun storedSession(
        accessToken: String = "storedToken",
    ) = AuthSession(
        accessToken = accessToken,
        refreshToken = "refresh",
        sessionId = "sid",
        userId = "uid1",
        userEmail = "a@b.com",
    )

    /**
     * Builds a minimal OkHttp [Response] whose request carries the given [token]
     * in the Authorization header. The [prior] response is wired as the prior
     * response to simulate retry chains.
     */
    private fun buildResponse(
        code: Int,
        token: String,
        prior: Response?,
    ): Response {
        val request = Request.Builder()
            .url("https://api.example.com/protected")
            .header("Authorization", "Bearer $token")
            .build()

        val builder = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("Unauthorized")

        if (prior != null) {
            builder.priorResponse(prior)
        }

        return builder.build()
    }
}
