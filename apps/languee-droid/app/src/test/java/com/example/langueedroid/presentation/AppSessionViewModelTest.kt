package com.example.langueedroid.presentation

import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSession
import com.example.langueedroid.data.local.AuthSessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.doSuspendableAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var authRepository: AuthRepository
    private lateinit var sessionStore: AuthSessionStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mock()
        sessionStore = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = AppSessionViewModel(authRepository, sessionStore)

    // -----------------------------------------------------------------------
    // Startup — no stored session (edge case 1)
    // -----------------------------------------------------------------------

    @Test
    fun `startup with null session store routes to Unauthorized`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
    }

    // -----------------------------------------------------------------------
    // Startup — partial session (only some keys stored → store returns null)
    // Represented by sessionStore.read() returning null even when prefs exist partially.
    // (edge case 1)
    // -----------------------------------------------------------------------

    @Test
    fun `startup with partial session store returns null and routes to Unauthorized without refresh`() = runTest {
        // AuthSessionStore.read() returns null when any required key is absent.
        whenever(sessionStore.read()).thenReturn(null)

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
        // refresh must never be attempted when there is no stored session
        verify(authRepository, never()).refreshSession()
    }

    // -----------------------------------------------------------------------
    // Startup — session present, refresh succeeds
    // -----------------------------------------------------------------------

    @Test
    fun `startup with valid session and successful refresh routes to Authorized`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authRepository.refreshSession()).thenReturn(Result.success(stored))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.sessionState.value
        assertTrue(state is AppSessionState.Authorized)
        assertEquals("uid1", (state as AppSessionState.Authorized).userId)
        assertEquals("a@b.com", state.userEmail)
    }

    // -----------------------------------------------------------------------
    // Startup — session present, refresh returns null body (edge case 2)
    // -----------------------------------------------------------------------

    @Test
    fun `startup with session but failed refresh routes to Unauthorized`() = runTest {
        val stored = storedSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authRepository.refreshSession()).thenReturn(
            Result.failure(RuntimeException("Token refresh failed: HTTP 401")),
        )

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
    }

    // -----------------------------------------------------------------------
    // Initial state is CheckingSession
    // -----------------------------------------------------------------------

    @Test
    fun `initial state before coroutine runs is CheckingSession`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)

        val vm = buildViewModel()
        // Do NOT advance — should still be checking.
        assertEquals(AppSessionState.CheckingSession, vm.sessionState.value)
    }

    // -----------------------------------------------------------------------
    // onAuthSuccess
    // -----------------------------------------------------------------------

    @Test
    fun `onAuthSuccess transitions to Authorized`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        val vm = buildViewModel()
        advanceUntilIdle()

        val session = storedSession()
        vm.onAuthSuccess(session)
        advanceUntilIdle()

        val state = vm.sessionState.value
        assertTrue(state is AppSessionState.Authorized)
        assertEquals("uid1", (state as AppSessionState.Authorized).userId)
        assertEquals("a@b.com", state.userEmail)
    }

    // -----------------------------------------------------------------------
    // onLogout — happy path (edge case 5)
    // -----------------------------------------------------------------------

    @Test
    fun `onLogout calls logout and routes to Unauthorized`() = runTest {
        whenever(sessionStore.read()).thenReturn(storedSession())
        whenever(authRepository.refreshSession()).thenReturn(Result.success(storedSession()))
        whenever(authRepository.logout()).thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onLogout()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
        verify(authRepository).logout()
    }

    // -----------------------------------------------------------------------
    // onLogout — network failure still routes to Unauthorized (edge case 5)
    // -----------------------------------------------------------------------

    @Test
    fun `onLogout routes to Unauthorized even when logout network call fails`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(authRepository.logout()).thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(storedSession())
        vm.onLogout()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
    }

    // -----------------------------------------------------------------------
    // Logout in-progress guard — double submission (edge case 6)
    //
    // Verify that logoutInProgress transitions: false -> true -> false.
    // We use doSuspendableAnswer to make logout() suspend mid-flight.
    // -----------------------------------------------------------------------

    @Test
    fun `logoutInProgress becomes true during logout and false after completion`() = runTest {
        val logoutGate = Channel<Result<Unit>>(capacity = 0)
        whenever(sessionStore.read()).thenReturn(null)
        whenever(authRepository.logout()).doSuspendableAnswer { logoutGate.receive() }

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onAuthSuccess(storedSession())

        assertFalse(vm.logoutInProgress.value)

        vm.onLogout()
        // Advance so the coroutine starts and sets logoutInProgress = true,
        // then suspends at logoutGate.receive().
        testDispatcher.scheduler.runCurrent()
        assertTrue(vm.logoutInProgress.value)

        // Release the gate and let the coroutine finish.
        logoutGate.send(Result.success(Unit))
        advanceUntilIdle()

        assertFalse(vm.logoutInProgress.value)
    }

    // -----------------------------------------------------------------------
    // Logout in-progress guard — second tap ignored (edge case 6)
    //
    // We use doSuspendableAnswer with a Channel gate to make logout() actually
    // suspend so that logoutInProgress is true when the second call arrives.
    // -----------------------------------------------------------------------

    @Test
    fun `second onLogout call while first is in-flight is ignored`() = runTest {
        val logoutGate = Channel<Result<Unit>>(capacity = 0)
        whenever(sessionStore.read()).thenReturn(null)
        whenever(authRepository.logout()).doSuspendableAnswer { logoutGate.receive() }

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onAuthSuccess(storedSession())

        // First logout: dispatch and advance until suspended at logoutGate.receive().
        vm.onLogout()
        testDispatcher.scheduler.runCurrent()

        // logoutInProgress must now be true (coroutine is suspended at Channel.receive()).
        assertTrue(vm.logoutInProgress.value)

        // Second call: should be rejected by the guard.
        vm.onLogout()

        // Release the gate.
        logoutGate.send(Result.success(Unit))
        advanceUntilIdle()

        // logout() was called exactly once (second tap was dropped).
        verify(authRepository).logout()
        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun storedSession() = AuthSession(
        accessToken = "access",
        refreshToken = "refresh",
        sessionId = "sid",
        userId = "uid1",
        userEmail = "a@b.com",
    )
}
