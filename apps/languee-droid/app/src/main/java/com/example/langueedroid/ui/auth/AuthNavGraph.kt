package com.example.langueedroid.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.langueedroid.data.local.AuthSession
import com.example.langueedroid.presentation.auth.LoginViewModel
import com.example.langueedroid.presentation.auth.RegisterViewModel

@Composable
fun AuthNavGraph(
    onAuthSuccess: (AuthSession) -> Unit,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = AuthNavRoutes.LANDING,
        modifier = modifier,
    ) {
        composable(AuthNavRoutes.LANDING) {
            AuthLandingScreen(
                onNavigateToLogin = { navController.navigate(AuthNavRoutes.LOGIN) },
                onNavigateToRegister = { navController.navigate(AuthNavRoutes.REGISTER) },
            )
        }

        composable(AuthNavRoutes.LOGIN) {
            val loginViewModel: LoginViewModel = hiltViewModel()
            val uiState by loginViewModel.uiState.collectAsState()
            val email by loginViewModel.email.collectAsState()
            val password by loginViewModel.password.collectAsState()

            LaunchedEffect(loginViewModel) {
                loginViewModel.authSuccessEvent.collect { session ->
                    onAuthSuccess(session)
                }
            }

            LoginScreen(
                uiState = uiState,
                email = email,
                password = password,
                onEmailChange = { loginViewModel.onEmailChange(it) },
                onPasswordChange = { loginViewModel.onPasswordChange(it) },
                onLoginClick = { loginViewModel.onLoginClick() },
                onNavigateBack = {
                    navController.navigate(AuthNavRoutes.LANDING) {
                        popUpTo(AuthNavRoutes.LANDING) { inclusive = false }
                    }
                },
                onNavigateToRegister = { navController.navigate(AuthNavRoutes.REGISTER) },
            )
        }

        composable(AuthNavRoutes.REGISTER) {
            val registerViewModel: RegisterViewModel = hiltViewModel()
            val uiState by registerViewModel.uiState.collectAsState()
            val email by registerViewModel.email.collectAsState()
            val password by registerViewModel.password.collectAsState()
            val confirmPassword by registerViewModel.confirmPassword.collectAsState()

            RegisterScreen(
                uiState = uiState,
                email = email,
                password = password,
                confirmPassword = confirmPassword,
                onEmailChange = { registerViewModel.onEmailChange(it) },
                onPasswordChange = { registerViewModel.onPasswordChange(it) },
                onConfirmPasswordChange = { registerViewModel.onConfirmPasswordChange(it) },
                onRegisterClick = { registerViewModel.onRegisterClick() },
                onNavigateBack = {
                    navController.navigate(AuthNavRoutes.LANDING) {
                        popUpTo(AuthNavRoutes.LANDING) { inclusive = false }
                    }
                },
                onNavigateToLogin = { navController.navigate(AuthNavRoutes.LOGIN) },
                onAuthSuccess = onAuthSuccess,
            )
        }
    }
}
