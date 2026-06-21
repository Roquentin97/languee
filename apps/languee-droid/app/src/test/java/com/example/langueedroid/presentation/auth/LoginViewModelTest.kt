package com.example.langueedroid.presentation.auth

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
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
import org.mockito.kotlin.any
import org.mockito.kotlin.doSuspendableAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var authRepository: AuthRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = LoginViewModel(authRepository)

    // -----------------------------------------------------------------------
    // Initial state
    // -----------------------------------------------------------------------

    @Test
    fun `initial state is Idle`() {
        val vm = buildViewModel()
        assertTrue(vm.uiState.value is AuthUiState.Idle)
    }

    // -----------------------------------------------------------------------
    // Field updates
    // -----------------------------------------------------------------------

    @Test
    fun `onEmailChange updates email flow`() {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        assertEquals("user@example.com", vm.email.value)
    }

    @Test
    fun `onPasswordChange updates password flow`() {
        val vm = buildViewModel()
        vm.onPasswordChange("secret123")
        assertEquals("secret123", vm.password.value)
    }

    // -----------------------------------------------------------------------
    // onLoginClick — blank validation
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick with blank email shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("   ")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    @Test
    fun `onLoginClick with blank password shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("")
        vm.onLoginClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    @Test
    fun `onLoginClick with blank email never calls authRepository`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        advanceUntilIdle()
        verify(authRepository, never()).login(any(), any())
    }

    @Test
    fun `onLoginClick with blank password never calls authRepository`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("   ")
        vm.onLoginClick()
        advanceUntilIdle()
        verify(authRepository, never()).login(any(), any())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — success
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick success emits authSuccessEvent and resets to Idle`() = runTest {
        val vm = buildViewModel()
        val session = fakeSession()
        whenever(authRepository.login(any(), any())).thenReturn(Result.success(session))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        val capturedSessions = mutableListOf<AuthSession>()
        val job = launch { vm.authSuccessEvent.collect { capturedSessions.add(it) } }
        vm.onLoginClick()
        advanceUntilIdle()
        job.cancel()
        assertTrue(vm.uiState.value is AuthUiState.Idle)
        assertEquals(1, capturedSessions.size)
        assertEquals(session, capturedSessions.first())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — network failure (edge case: backend failure on login)
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick network exception shows Error state with message`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.login(any(), any()))
            .thenReturn(Result.failure(RuntimeException("Network error")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        advanceUntilIdle()
        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Error)
        assertEquals("Network error", (state as AuthUiState.Error).message)
    }

    @Test
    fun `onLoginClick network exception does not emit authSuccessEvent`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.login(any(), any()))
            .thenReturn(Result.failure(RuntimeException("Network error")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        val capturedSessions = mutableListOf<AuthSession>()
        val job = launch { vm.authSuccessEvent.collect { capturedSessions.add(it) } }
        vm.onLoginClick()
        advanceUntilIdle()
        job.cancel()
        assertTrue(capturedSessions.isEmpty())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — HTTP error
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick repository failure shows Error state and does not emit authSuccessEvent`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.login(any(), any()))
            .thenReturn(Result.failure(RuntimeException("HTTP 401")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        val capturedSessions = mutableListOf<AuthSession>()
        val job = launch { vm.authSuccessEvent.collect { capturedSessions.add(it) } }
        vm.onLoginClick()
        advanceUntilIdle()
        job.cancel()
        assertTrue(vm.uiState.value is AuthUiState.Error)
        assertTrue(capturedSessions.isEmpty())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — Loading state during request
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick sets Loading state then resolves to Idle on success`() = runTest {
        val vm = buildViewModel()
        val gate = Channel<Unit>()
        whenever(authRepository.login(any(), any())).doSuspendableAnswer {
            gate.receive()
            Result.success(fakeSession())
        }
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        testScheduler.advanceUntilIdle()
        // At this point login() is suspended — Loading must be set
        assertTrue(vm.uiState.value is AuthUiState.Loading)
        gate.send(Unit)
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Idle)
    }

    // -----------------------------------------------------------------------
    // onLoginClick — Loading guard: repeated tap while in-flight is ignored
    // (edge case: repeated taps while Loading)
    // -----------------------------------------------------------------------

    @Test
    fun `second onLoginClick while Loading is ignored`() = runTest {
        val vm = buildViewModel()
        val gate = Channel<Unit>()
        var callCount = 0
        whenever(authRepository.login(any(), any())).doSuspendableAnswer {
            callCount++
            gate.receive()
            Result.success(fakeSession())
        }
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        testScheduler.advanceUntilIdle()
        // state is Loading now
        assertTrue(vm.uiState.value is AuthUiState.Loading)
        // second tap should be ignored
        vm.onLoginClick()
        testScheduler.advanceUntilIdle()
        gate.send(Unit)
        advanceUntilIdle()
        assertEquals(1, callCount)
    }

    // -----------------------------------------------------------------------
    // onLoginClick — fallback error message when exception has no message
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick with null exception message shows fallback error`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.login(any(), any()))
            .thenReturn(Result.failure(RuntimeException()))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onLoginClick()
        advanceUntilIdle()
        val state = vm.uiState.value as AuthUiState.Error
        assertEquals("Login failed", state.message)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun fakeSession() = AuthSession(
        accessToken = "access",
        refreshToken = "refresh",
        sessionId = "sid",
        userId = "uid1",
        userEmail = "user@example.com",
    )
}
