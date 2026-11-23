package com.example.langueedroid.presentation.auth

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.domain.AccountMismatchException
import com.example.langueedroid.core.domain.InvalidCredentialsException
import com.example.langueedroid.feature.auth.presentation.AuthUiError
import com.example.langueedroid.feature.auth.presentation.AuthUiState
import com.example.langueedroid.feature.auth.presentation.LoginViewModel
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
import java.io.IOException

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
    fun `onLoginClick with blank email shows Error state`() =
        runTest {
            val vm = buildViewModel()
            vm.onEmailChange("   ")
            vm.onPasswordChange("secret")
            vm.onLoginClick()
            advanceUntilIdle()
            assertTrue(vm.uiState.value is AuthUiState.Error)
        }

    @Test
    fun `onLoginClick with blank password shows Error state`() =
        runTest {
            val vm = buildViewModel()
            vm.onEmailChange("user@example.com")
            vm.onPasswordChange("")
            vm.onLoginClick()
            advanceUntilIdle()
            assertTrue(vm.uiState.value is AuthUiState.Error)
        }

    @Test
    fun `onLoginClick with blank email never calls authRepository`() =
        runTest {
            val vm = buildViewModel()
            vm.onEmailChange("")
            vm.onPasswordChange("secret")
            vm.onLoginClick()
            advanceUntilIdle()
            verify(authRepository, never()).login(any(), any())
        }

    @Test
    fun `onLoginClick with blank password never calls authRepository`() =
        runTest {
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
    fun `onLoginClick success emits authSuccessEvent and resets to Idle`() =
        runTest {
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
    fun `onLoginClick network exception shows Error state with message`() =
        runTest {
            val vm = buildViewModel()
            whenever(authRepository.login(any(), any()))
                .thenReturn(Result.failure(IOException("timeout detail must stay private")))
            vm.onEmailChange("user@example.com")
            vm.onPasswordChange("secret")
            vm.onLoginClick()
            advanceUntilIdle()
            val state = vm.uiState.value
            assertTrue(state is AuthUiState.Error)
            assertEquals(AuthUiError.CONNECTION, (state as AuthUiState.Error).type)
        }

    @Test
    fun `onLoginClick network exception does not emit authSuccessEvent`() =
        runTest {
            val vm = buildViewModel()
            whenever(authRepository.login(any(), any()))
                .thenReturn(Result.failure(IOException("timeout")))
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
    fun `onLoginClick repository failure shows Error state and does not emit authSuccessEvent`() =
        runTest {
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

    @Test
    fun `invalid credentials show a specific actionable error`() =
        runTest {
            val vm = buildViewModel()
            whenever(authRepository.login(any(), any())).thenReturn(Result.failure(InvalidCredentialsException()))
            vm.onEmailChange("user@example.com")
            vm.onPasswordChange("wrong")

            vm.onLoginClick()
            advanceUntilIdle()

            assertEquals(AuthUiError.INVALID_CREDENTIALS, (vm.uiState.value as AuthUiState.Error).type)
            assertEquals("user@example.com", vm.email.value)
            assertEquals("wrong", vm.password.value)
        }

    @Test
    fun `recovery login rejects a different account without emitting success`() =
        runTest {
            val vm = buildViewModel()
            whenever(authRepository.login(any(), any(), any()))
                .thenReturn(Result.failure(AccountMismatchException()))
            vm.onEmailChange("other@example.com")
            vm.onPasswordChange("secret")
            val capturedSessions = mutableListOf<AuthSession>()
            val job = launch { vm.authSuccessEvent.collect { capturedSessions.add(it) } }

            vm.onLoginClick(requiredUserId = "uid1")
            advanceUntilIdle()
            job.cancel()

            assertEquals(AuthUiError.ACCOUNT_MISMATCH, (vm.uiState.value as AuthUiState.Error).type)
            assertTrue(capturedSessions.isEmpty())
            verify(authRepository).login("other@example.com", "secret", "uid1")
        }

    @Test
    fun `recovery login for the same account emits success`() =
        runTest {
            val vm = buildViewModel()
            val session = fakeSession()
            whenever(authRepository.login(any(), any(), any())).thenReturn(Result.success(session))
            vm.onEmailChange("user@example.com")
            vm.onPasswordChange("secret")
            val capturedSessions = mutableListOf<AuthSession>()
            val job = launch { vm.authSuccessEvent.collect { capturedSessions.add(it) } }

            vm.onLoginClick(requiredUserId = session.userId)
            advanceUntilIdle()
            job.cancel()

            assertEquals(listOf(session), capturedSessions)
            verify(authRepository).login("user@example.com", "secret", session.userId)
        }

    // -----------------------------------------------------------------------
    // onLoginClick — Loading state during request
    // -----------------------------------------------------------------------

    @Test
    fun `onLoginClick sets Loading state then resolves to Idle on success`() =
        runTest {
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
    fun `second onLoginClick while Loading is ignored`() =
        runTest {
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
    fun `onLoginClick with null exception message uses safe generic error`() =
        runTest {
            val vm = buildViewModel()
            whenever(authRepository.login(any(), any()))
                .thenReturn(Result.failure(RuntimeException()))
            vm.onEmailChange("user@example.com")
            vm.onPasswordChange("secret")
            vm.onLoginClick()
            advanceUntilIdle()
            val state = vm.uiState.value as AuthUiState.Error
            assertEquals(AuthUiError.UNEXPECTED, state.type)
        }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun fakeSession() =
        AuthSession(
            accessToken = "access",
            refreshToken = "refresh",
            sessionId = "sid",
            userId = "uid1",
            userEmail = "user@example.com",
        )
}
