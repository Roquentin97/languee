package com.example.langueedroid

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.local.AuthSessionStore
import com.example.langueedroid.data.remote.ApiClient
import com.example.langueedroid.data.remote.AuthAuthenticator
import com.example.langueedroid.presentation.AppSessionState
import com.example.langueedroid.presentation.AppSessionViewModel
import com.example.langueedroid.presentation.auth.AuthViewModel
import com.example.langueedroid.ui.CheckingSessionScreen
import com.example.langueedroid.ui.HomeScreen
import com.example.langueedroid.ui.auth.AuthScreen
import com.example.langueedroid.ui.theme.LangueeDroidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Build the manual dependency graph once per Activity lifecycle.
        val sessionStore = AuthSessionStore(applicationContext)

        // AuthAuthenticator needs a repository reference; use a mutable holder to break the
        // circular dependency: ApiClient -> AuthAuthenticator -> AuthRepository -> ApiClient.
        var authRepositoryHolder: AuthRepository? = null
        val authAuthenticator = AuthAuthenticator(
            sessionStore = sessionStore,
            repositoryProvider = {
                requireNotNull(authRepositoryHolder) { "AuthRepository not yet initialised" }
            },
        )
        val apiClient = ApiClient(
            sessionStore = sessionStore,
            authAuthenticator = authAuthenticator,
        )
        val authApi = apiClient.createAuthApi()
        val authRepository = AuthRepository(
            authApi = authApi,
            sessionStore = sessionStore,
        )
        authRepositoryHolder = authRepository

        val appSessionViewModelFactory = AppSessionViewModel.Factory(
            authRepository = authRepository,
            sessionStore = sessionStore,
        )

        setContent {
            LangueeDroidTheme {
                LangueeApp(
                    appSessionViewModelFactory = appSessionViewModelFactory,
                    authRepository = authRepository,
                )
            }
        }
    }
}

@Composable
private fun LangueeApp(
    appSessionViewModelFactory: AppSessionViewModel.Factory,
    authRepository: AuthRepository,
) {
    val appSessionViewModel: AppSessionViewModel = viewModel(factory = appSessionViewModelFactory)
    val sessionState by appSessionViewModel.sessionState.collectAsState()
    val logoutInProgress by appSessionViewModel.logoutInProgress.collectAsState()

    when (val state = sessionState) {
        is AppSessionState.CheckingSession -> {
            CheckingSessionScreen()
        }

        is AppSessionState.Unauthorized -> {
            val authViewModelFactory = AuthViewModel.Factory(
                authRepository = authRepository,
                onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) },
            )
            val authViewModel: AuthViewModel = viewModel(factory = authViewModelFactory)
            val uiState by authViewModel.uiState.collectAsState()
            val email by authViewModel.email.collectAsState()
            val password by authViewModel.password.collectAsState()

            AuthScreen(
                uiState = uiState,
                email = email,
                password = password,
                onEmailChange = { authViewModel.onEmailChange(it) },
                onPasswordChange = { authViewModel.onPasswordChange(it) },
                onLoginClick = { authViewModel.onLoginClick() },
                onRegisterClick = { authViewModel.onRegisterClick() },
            )
        }

        is AppSessionState.Authorized -> {
            HomeScreen(
                userEmail = state.userEmail,
                onLogout = { appSessionViewModel.onLogout() },
                logoutInProgress = logoutInProgress,
            )
        }
    }
}
