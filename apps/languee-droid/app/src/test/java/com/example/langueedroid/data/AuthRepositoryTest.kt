package com.example.langueedroid.data

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.dto.AuthUserDto
import com.example.langueedroid.core.network.dto.LoginRegisterResponse
import com.example.langueedroid.core.network.dto.RefreshResponse
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import retrofit2.Response

class AuthRepositoryTest {

    private lateinit var authApi: AuthApi
    private lateinit var sessionStore: AuthSessionStore
    private lateinit var repository: AuthRepository

    @Before
    fun setUp() {
        authApi = mock()
        sessionStore = mock()
        repository = AuthRepository(authApi, sessionStore)
    }

    // -----------------------------------------------------------------------
    // login — happy path
    // -----------------------------------------------------------------------

    @Test
    fun `login success saves session and returns AuthSession`() = runTest {
        val response = successLoginResponse()
        whenever(authApi.login(any())).thenReturn(response)

        val result = repository.login("a@b.com", "pw")

        assertTrue(result.isSuccess)
        val session = result.getOrThrow()
        assertEquals("access1", session.accessToken)
        assertEquals("refresh1", session.refreshToken)
        assertEquals("sid1", session.sessionId)
        assertEquals("uid1", session.userId)
        assertEquals("a@b.com", session.userEmail)
        verify(sessionStore).save(session)
    }

    // -----------------------------------------------------------------------
    // login — HTTP error
    // -----------------------------------------------------------------------

    @Test
    fun `login HTTP error returns failure with code in message`() = runTest {
        whenever(authApi.login(any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.login("a@b.com", "pw")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("401") == true)
        verify(sessionStore, never()).save(any())
    }

    // -----------------------------------------------------------------------
    // login — network exception (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `login network exception returns failure and does not store partial session`() = runTest {
        whenever(authApi.login(any())).thenThrow(RuntimeException("no connectivity"))

        val result = repository.login("a@b.com", "pw")

        assertTrue(result.isFailure)
        verify(sessionStore, never()).save(any())
    }

    // -----------------------------------------------------------------------
    // register — happy path
    // -----------------------------------------------------------------------

    @Test
    fun `register success saves session and returns AuthSession`() = runTest {
        val response = successLoginResponse()
        whenever(authApi.register(any())).thenReturn(response)

        val result = repository.register("a@b.com", "pw")

        assertTrue(result.isSuccess)
        val session = result.getOrThrow()
        assertEquals("access1", session.accessToken)
        verify(sessionStore).save(session)
    }

    // -----------------------------------------------------------------------
    // register — HTTP error (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `register HTTP error returns failure and does not store session`() = runTest {
        whenever(authApi.register(any())).thenReturn(
            Response.error(422, "{}".toResponseBody()),
        )

        val result = repository.register("a@b.com", "pw")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("422") == true)
        verify(sessionStore, never()).save(any())
    }

    // -----------------------------------------------------------------------
    // register — network exception (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `register network exception returns failure and does not store session`() = runTest {
        whenever(authApi.register(any())).thenThrow(RuntimeException("no connectivity"))

        val result = repository.register("a@b.com", "pw")

        assertTrue(result.isFailure)
        verify(sessionStore, never()).save(any())
    }

    // -----------------------------------------------------------------------
    // refreshSession — happy path (edge case 8)
    // -----------------------------------------------------------------------

    @Test
    fun `refreshSession success persists rotated tokens and returns new session`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        val refreshBody = RefreshResponse("newAccess", "newRefresh", "newSid")
        whenever(authApi.refresh(any())).thenReturn(Response.success(refreshBody))

        val result = repository.refreshSession()

        assertTrue(result.isSuccess)
        val session = result.getOrThrow()
        assertEquals("newAccess", session.accessToken)
        assertEquals("newRefresh", session.refreshToken)
        assertEquals("newSid", session.sessionId)
        // userId and userEmail preserved from stored
        assertEquals("uid1", session.userId)
        assertEquals("a@b.com", session.userEmail)
        verify(sessionStore).updateTokens("newAccess", "newRefresh", "newSid")
    }

    // -----------------------------------------------------------------------
    // refreshSession — null body (edge case 2)
    // -----------------------------------------------------------------------

    @Test
    fun `refreshSession null body clears session and returns failure`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authApi.refresh(any())).thenReturn(Response.success(null))

        val result = repository.refreshSession()

        assertTrue(result.isFailure)
        // clear() is called twice: once in the else-branch of the HTTP check and
        // once in the onFailure handler (which runs for all failures except "No stored session").
        verify(sessionStore, times(2)).clear()
    }

    // -----------------------------------------------------------------------
    // refreshSession — HTTP error (edge case 2)
    // -----------------------------------------------------------------------

    @Test
    fun `refreshSession HTTP error clears session and returns failure`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authApi.refresh(any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.refreshSession()

        assertTrue(result.isFailure)
        // clear() is called twice: once in the else-branch of the HTTP check and
        // once in the onFailure handler (which runs for all failures except "No stored session").
        verify(sessionStore, times(2)).clear()
    }

    // -----------------------------------------------------------------------
    // refreshSession — no stored session (edge case 1)
    // -----------------------------------------------------------------------

    @Test
    fun `refreshSession with no stored session returns failure without clearing`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)

        val result = repository.refreshSession()

        assertTrue(result.isFailure)
        verify(sessionStore, never()).clear()
    }

    // -----------------------------------------------------------------------
    // refreshSession — network exception clears session (onFailure handler)
    // -----------------------------------------------------------------------

    @Test
    fun `refreshSession network exception clears session via onFailure handler`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authApi.refresh(any())).thenThrow(RuntimeException("no connectivity"))

        val result = repository.refreshSession()

        assertTrue(result.isFailure)
        // The onFailure block clears for any exception that isn't
        // "Token refresh failed" or "No stored session".
        verify(sessionStore).clear()
    }

    // -----------------------------------------------------------------------
    // logout — happy path (edge case 5)
    // -----------------------------------------------------------------------

    @Test
    fun `logout always clears session and returns success even when server call succeeds`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authApi.logout(any(), any())).thenReturn(Response.success(null))

        val result = repository.logout()

        assertTrue(result.isSuccess)
        verify(sessionStore).clear()
    }

    // -----------------------------------------------------------------------
    // logout — network failure still clears (edge case 5)
    // -----------------------------------------------------------------------

    @Test
    fun `logout clears session even when network call throws`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authApi.logout(any(), any())).thenThrow(RuntimeException("network error"))

        val result = repository.logout()

        assertTrue(result.isSuccess)
        verify(sessionStore).clear()
    }

    // -----------------------------------------------------------------------
    // logout — no stored session
    // -----------------------------------------------------------------------

    @Test
    fun `logout with no stored session still returns success and clears`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)

        val result = repository.logout()

        assertTrue(result.isSuccess)
        verify(sessionStore).clear()
        verify(authApi, never()).logout(any(), any())
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun successLoginResponse(): Response<LoginRegisterResponse> {
        val body = LoginRegisterResponse(
            accessToken = "access1",
            refreshToken = "refresh1",
            sessionId = "sid1",
            user = AuthUserDto(id = "uid1", email = "a@b.com"),
        )
        return Response.success(body)
    }

    private fun storedSession() = AuthSession(
        accessToken = "oldAccess",
        refreshToken = "oldRefresh",
        sessionId = "oldSid",
        userId = "uid1",
        userEmail = "a@b.com",
    )
}
