package com.example.langueedroid.presentation.auth

import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSession
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
import kotlinx.coroutines.channels.Channel
import org.mockito.kotlin.any
import org.mockito.kotlin.doSuspendableAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var authRepository: AuthRepository
    private val capturedSessions = mutableListOf<AuthSession>()
    private val onAuthSuccess: (AuthSession) -> Unit = { capturedSessions.add(it) }

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        authRepository = mock()
        capturedSessions.clear()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = AuthViewModel(authRepository, onAuthSuccess)

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
        vm.onPasswordChange("secret")
        assertEquals("secret", vm.password.value)
    }

    // -----------------------------------------------------------------------
    // onLoginClick — blank validation
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick with blank email shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("")
        vm.onPasswordChange("password")
        vm.onLoginClick()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Error)
        verify(authRepository, never()).login(any(), any())
    }

    @Test
    fun `onLoginClick with blank password shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("")
        vm.onLoginClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Error)
        verify(authRepository, never()).login(any(), any())
    }

    @Test
    fun `onLoginClick with blank fields never calls authRepository`() = runTest {
        val vm = buildViewModel()
        vm.onLoginClick()
        advanceUntilIdle()
        verify(authRepository, never()).login(any(), any())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — success
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick success calls onAuthSuccess and resets to Idle`() = runTest {
        val session = fakeSession()
        whenever(authRepository.login("a@b.com", "pw")).thenReturn(Result.success(session))

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onLoginClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Idle)
        assertEquals(1, capturedSessions.size)
        assertEquals(session, capturedSessions[0])
    }

    // -----------------------------------------------------------------------
    // onLoginClick — network failure (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick network exception shows Error state with message`() = runTest {
        whenever(authRepository.login(any(), any())).thenReturn(
            Result.failure(RuntimeException("no connectivity")),
        )

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onLoginClick()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Error)
        assertTrue((state as AuthUiState.Error).message.isNotBlank())
        assertTrue(capturedSessions.isEmpty())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — HTTP error (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick HTTP error shows Error state and does not call onAuthSuccess`() = runTest {
        whenever(authRepository.login(any(), any())).thenReturn(
            Result.failure(RuntimeException("Login failed: HTTP 401")),
        )

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onLoginClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Error)
        assertTrue(capturedSessions.isEmpty())
    }

    // -----------------------------------------------------------------------
    // onLoginClick — Loading state during request
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick sets Loading state then resolves to Idle on success`() = runTest {
        val gate = Channel<Result<AuthSession>>(capacity = 0)
        whenever(authRepository.login(any(), any())).doSuspendableAnswer { gate.receive() }

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onLoginClick()

        // Advance so the coroutine runs and sets Loading, then suspends at gate.receive().
        testDispatcher.scheduler.runCurrent()
        assertTrue(vm.uiState.value is AuthUiState.Loading)

        gate.send(Result.success(fakeSession()))
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Idle)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — blank validation
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick with blank email shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("  ")
        vm.onPasswordChange("pw")
        vm.onRegisterClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Error)
        verify(authRepository, never()).register(any(), any())
    }

    @Test
    fun `onRegisterClick with blank password shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("")
        vm.onRegisterClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Error)
        verify(authRepository, never()).register(any(), any())
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — success
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick success calls onAuthSuccess and resets to Idle`() = runTest {
        val session = fakeSession()
        whenever(authRepository.register("a@b.com", "pw")).thenReturn(Result.success(session))

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onRegisterClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Idle)
        assertEquals(1, capturedSessions.size)
        assertEquals(session, capturedSessions[0])
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — network failure (edge case 3)
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick network exception shows Error state and no partial session stored`() = runTest {
        whenever(authRepository.register(any(), any())).thenReturn(
            Result.failure(RuntimeException("no connectivity")),
        )

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onRegisterClick()
        advanceUntilIdle()

        assertTrue(vm.uiState.value is AuthUiState.Error)
        assertTrue(capturedSessions.isEmpty())
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — Loading state
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick sets Loading state then resolves to Idle on success`() = runTest {
        val gate = Channel<Result<AuthSession>>(capacity = 0)
        whenever(authRepository.register(any(), any())).doSuspendableAnswer { gate.receive() }

        val vm = buildViewModel()
        vm.onEmailChange("a@b.com")
        vm.onPasswordChange("pw")
        vm.onRegisterClick()

        // Advance so the coroutine runs and sets Loading, then suspends at gate.receive().
        testDispatcher.scheduler.runCurrent()
        assertTrue(vm.uiState.value is AuthUiState.Loading)

        gate.send(Result.success(fakeSession()))
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Idle)
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun fakeSession() = AuthSession(
        accessToken = "access",
        refreshToken = "refresh",
        sessionId = "sid",
        userId = "uid1",
        userEmail = "a@b.com",
    )
}
