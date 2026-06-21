package com.example.langueedroid.presentation.auth

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
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
class RegisterViewModelTest {

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

    private fun buildViewModel() = RegisterViewModel(authRepository)

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

    @Test
    fun `onConfirmPasswordChange updates confirmPassword flow`() {
        val vm = buildViewModel()
        vm.onConfirmPasswordChange("secret123")
        assertEquals("secret123", vm.confirmPassword.value)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — blank validation
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick with blank email shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("   ")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    @Test
    fun `onRegisterClick with blank password shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("")
        vm.onConfirmPasswordChange("")
        vm.onRegisterClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    @Test
    fun `onRegisterClick with blank confirmPassword shows Error state`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("   ")
        vm.onRegisterClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    @Test
    fun `onRegisterClick with blank fields never calls authRepository`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("")
        vm.onPasswordChange("")
        vm.onConfirmPasswordChange("")
        vm.onRegisterClick()
        advanceUntilIdle()
        verify(authRepository, never()).register(any(), any())
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — password mismatch (edge case)
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick with mismatched passwords shows Error without network call`() = runTest {
        val vm = buildViewModel()
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret1")
        vm.onConfirmPasswordChange("secret2")
        vm.onRegisterClick()
        advanceUntilIdle()
        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Error)
        assertEquals("Passwords do not match", (state as AuthUiState.Error).message)
        verify(authRepository, never()).register(any(), any())
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — success
    // Architect edge case: Success state carries the session; onAuthSuccess is NOT
    // called from the ViewModel — it is driven by the UI layer via LaunchedEffect.
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick success sets Success state with session`() = runTest {
        val vm = buildViewModel()
        val session = fakeSession()
        whenever(authRepository.register(any(), any())).thenReturn(Result.success(session))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Success)
        assertEquals(session, (state as AuthUiState.Success).session)
    }

    @Test
    fun `onRegisterClick success transitions through Loading then resolves to Success`() = runTest {
        val vm = buildViewModel()
        val session = fakeSession()
        val gate = Channel<Unit>()
        whenever(authRepository.register(any(), any())).doSuspendableAnswer {
            gate.receive()
            Result.success(session)
        }
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        testScheduler.advanceUntilIdle()
        // Suspended at gate — state is Loading
        assertTrue(vm.uiState.value is AuthUiState.Loading)
        gate.send(Unit)
        advanceUntilIdle()
        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Success)
        assertEquals(session, (state as AuthUiState.Success).session)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — network failure (edge case: backend failure on register)
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick network exception shows Error state`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.register(any(), any()))
            .thenReturn(Result.failure(RuntimeException("Network error")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        val state = vm.uiState.value
        assertTrue(state is AuthUiState.Error)
        assertEquals("Network error", (state as AuthUiState.Error).message)
    }

    @Test
    fun `onRegisterClick network exception leaves state as Error not Success`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.register(any(), any()))
            .thenReturn(Result.failure(RuntimeException("Network error")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value !is AuthUiState.Success)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — repository failure (HTTP error)
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick repository failure shows Error state`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.register(any(), any()))
            .thenReturn(Result.failure(RuntimeException("HTTP 409")))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Error)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — Loading state during request
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick sets Loading state then resolves after register call`() = runTest {
        val vm = buildViewModel()
        val gate = Channel<Unit>()
        whenever(authRepository.register(any(), any())).doSuspendableAnswer {
            gate.receive()
            Result.success(fakeSession())
        }
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        testScheduler.advanceUntilIdle()
        // Suspended at gate — Loading must be set
        assertTrue(vm.uiState.value is AuthUiState.Loading)
        gate.send(Unit)
        advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Success)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — Loading guard: repeated tap while in-flight is ignored
    // (edge case: repeated taps while Loading)
    // -----------------------------------------------------------------------

    @Test
    fun `second onRegisterClick while Loading is ignored`() = runTest {
        val vm = buildViewModel()
        val gate = Channel<Unit>()
        var callCount = 0
        whenever(authRepository.register(any(), any())).doSuspendableAnswer {
            callCount++
            gate.receive()
            Result.success(fakeSession())
        }
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        testScheduler.advanceUntilIdle()
        assertTrue(vm.uiState.value is AuthUiState.Loading)
        // Second tap while loading — must be ignored
        vm.onRegisterClick()
        testScheduler.advanceUntilIdle()
        gate.send(Unit)
        advanceUntilIdle()
        assertEquals(1, callCount)
    }

    // -----------------------------------------------------------------------
    // onRegisterClick — fallback error message when exception has no message
    // -----------------------------------------------------------------------

    @Test
    fun `onRegisterClick with null exception message shows fallback error`() = runTest {
        val vm = buildViewModel()
        whenever(authRepository.register(any(), any()))
            .thenReturn(Result.failure(RuntimeException()))
        vm.onEmailChange("user@example.com")
        vm.onPasswordChange("secret")
        vm.onConfirmPasswordChange("secret")
        vm.onRegisterClick()
        advanceUntilIdle()
        val state = vm.uiState.value as AuthUiState.Error
        assertEquals("Registration failed", state.message)
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
