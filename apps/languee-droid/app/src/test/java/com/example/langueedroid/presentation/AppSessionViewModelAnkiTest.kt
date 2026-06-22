package com.example.langueedroid.presentation

import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.feature.session.presentation.AppSessionState
import com.example.langueedroid.feature.session.presentation.AppSessionViewModel
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.domain.ExportPreference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests for AppSessionViewModel covering the AnkiDroid setup routing added in
 * the ankidroid-export-integration feature:
 * - onAuthSuccess routes to AuthorizedPendingAnkiSetup when setup not complete
 * - onAuthSuccess routes to Authorized when setup already complete
 * - onAnkiSetupFinished marks setup complete and transitions to Authorized
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AppSessionViewModelAnkiTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var authRepository: AuthRepository
    private lateinit var sessionStore: AuthSessionStore
    private lateinit var prefsStore: AnkiDroidPreferencesStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mock()
        sessionStore = mock()
        prefsStore = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aSession() = AuthSession(
        accessToken = "access",
        refreshToken = "refresh",
        sessionId = "sid",
        userId = "uid1",
        userEmail = "a@b.com",
    )

    private fun incompleteSetupPrefs() = AnkiDroidSetupPrefs(
        noteTypeName = "Languee Mobile Native Type Vocabulary",
        exportPreference = ExportPreference.MANUAL,
        setupCompleted = false,
    )

    private fun completedSetupPrefs() = incompleteSetupPrefs().copy(setupCompleted = true)

    private fun buildViewModel() = AppSessionViewModel(
        authRepository = authRepository,
        sessionStore = sessionStore,
        prefsStore = prefsStore,
    )

    // -------------------------------------------------------------------------
    // onAuthSuccess — routes to AuthorizedPendingAnkiSetup when setup not done
    // -------------------------------------------------------------------------

    @Test
    fun `onAuthSuccess routes to AuthorizedPendingAnkiSetup when setup not completed`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(aSession())
        advanceUntilIdle()

        val state = vm.sessionState.value
        assertTrue(state is AppSessionState.AuthorizedPendingAnkiSetup)
        assertEquals("uid1", (state as AppSessionState.AuthorizedPendingAnkiSetup).userId)
        assertEquals("a@b.com", state.userEmail)
    }

    // -------------------------------------------------------------------------
    // onAuthSuccess — routes to Authorized when setup already completed
    // -------------------------------------------------------------------------

    @Test
    fun `onAuthSuccess routes to Authorized when setup already completed`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(completedSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(aSession())
        advanceUntilIdle()

        val state = vm.sessionState.value
        assertTrue(state is AppSessionState.Authorized)
        assertEquals("uid1", (state as AppSessionState.Authorized).userId)
    }

    // -------------------------------------------------------------------------
    // startup refresh — routes to AuthorizedPendingAnkiSetup when session exists
    // but setup not completed
    // -------------------------------------------------------------------------

    @Test
    fun `startup refresh routes to AuthorizedPendingAnkiSetup when setup not completed`() = runTest {
        val stored = aSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authRepository.refreshSession()).thenReturn(Result.success(stored))
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.sessionState.value is AppSessionState.AuthorizedPendingAnkiSetup)
    }

    // -------------------------------------------------------------------------
    // startup refresh — routes to Authorized when setup already complete
    // -------------------------------------------------------------------------

    @Test
    fun `startup refresh routes to Authorized when setup already completed`() = runTest {
        val stored = aSession()
        whenever(sessionStore.read()).thenReturn(stored)
        whenever(authRepository.refreshSession()).thenReturn(Result.success(stored))
        whenever(prefsStore.read()).thenReturn(completedSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.sessionState.value is AppSessionState.Authorized)
    }

    // -------------------------------------------------------------------------
    // onAnkiSetupFinished — marks setupCompleted and transitions to Authorized
    // -------------------------------------------------------------------------

    @Test
    fun `onAnkiSetupFinished from AuthorizedPendingAnkiSetup transitions to Authorized`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(aSession())
        advanceUntilIdle()

        // Now in AuthorizedPendingAnkiSetup
        assertTrue(vm.sessionState.value is AppSessionState.AuthorizedPendingAnkiSetup)

        // Finish setup
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())
        vm.onAnkiSetupFinished()
        advanceUntilIdle()

        val state = vm.sessionState.value
        assertTrue(state is AppSessionState.Authorized)
        assertEquals("uid1", (state as AppSessionState.Authorized).userId)
        assertEquals("a@b.com", state.userEmail)
    }

    @Test
    fun `onAnkiSetupFinished saves prefs with setupCompleted true`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(aSession())
        advanceUntilIdle()

        vm.onAnkiSetupFinished()
        advanceUntilIdle()

        verify(prefsStore).save(completedSetupPrefs())
    }

    // -------------------------------------------------------------------------
    // onAnkiSetupFinished — from Authorized state (no-op on state, saves prefs)
    // -------------------------------------------------------------------------

    @Test
    fun `onAnkiSetupFinished from Authorized state stays Authorized`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(completedSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onAuthSuccess(aSession())
        advanceUntilIdle()

        assertTrue(vm.sessionState.value is AppSessionState.Authorized)

        // Calling onAnkiSetupFinished while already Authorized should keep Authorized state
        vm.onAnkiSetupFinished()
        advanceUntilIdle()

        assertTrue(vm.sessionState.value is AppSessionState.Authorized)
    }

    // -------------------------------------------------------------------------
    // onAnkiSetupFinished — from non-authorized state does nothing
    // -------------------------------------------------------------------------

    @Test
    fun `onAnkiSetupFinished from Unauthorized state does nothing`() = runTest {
        whenever(sessionStore.read()).thenReturn(null)
        whenever(prefsStore.read()).thenReturn(incompleteSetupPrefs())

        val vm = buildViewModel()
        advanceUntilIdle()

        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)

        vm.onAnkiSetupFinished()
        advanceUntilIdle()

        // Should remain Unauthorized — no transition happens from non-auth states
        assertEquals(AppSessionState.Unauthorized, vm.sessionState.value)
    }
}
