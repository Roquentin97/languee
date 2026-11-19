package com.example.langueedroid

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.langueedroid.core.ui.theme.LangueeDroidTheme
import com.example.langueedroid.feature.anki.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.feature.anki.ui.AnkiDroidSetupScreen
import com.example.langueedroid.feature.auth.ui.AuthEntryNotice
import com.example.langueedroid.feature.auth.ui.AuthNavGraph
import com.example.langueedroid.feature.session.presentation.AppSessionState
import com.example.langueedroid.feature.session.presentation.AppSessionViewModel
import com.example.langueedroid.feature.session.ui.CheckingSessionScreen
import com.example.langueedroid.feature.session.ui.MainScreen
import com.example.langueedroid.feature.session.ui.SessionCheckFailedScreen
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var sharedText by mutableStateOf<String?>(null)
    private var shareId by mutableStateOf(0L)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        sharedText = sharedTextFrom(intent)
        shareId = savedInstanceState?.getLong("shareId") ?: if (sharedText == null) 0L else 1L

        setContent {
            LangueeDroidTheme {
                LangueeApp(sharedText = sharedText, shareId = shareId, onExitSharedCapture = { finish() })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        sharedTextFrom(intent)?.let { text ->
            sharedText = text
            shareId++
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putLong("shareId", shareId)
        super.onSaveInstanceState(outState)
    }

    private fun sharedTextFrom(intent: Intent?): String? =
        when {
            intent?.action == Intent.ACTION_SEND && intent.type == "text/plain" -> intent.getStringExtra(Intent.EXTRA_TEXT)
            intent?.action == Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        }
}

@Composable
private fun LangueeApp(
    sharedText: String?,
    shareId: Long,
    onExitSharedCapture: () -> Unit,
) {
    val appSessionViewModel: AppSessionViewModel = hiltViewModel()
    val sessionState by appSessionViewModel.sessionState.collectAsState()
    val logoutInProgress by appSessionViewModel.logoutInProgress.collectAsState()

    SessionStateContent(
        state = sessionState,
        appSessionViewModel = appSessionViewModel,
        logoutInProgress = logoutInProgress,
        sharedText = sharedText,
        shareId = shareId,
        onExitSharedCapture = onExitSharedCapture,
    )
}

@Composable
private fun SessionStateContent(
    state: AppSessionState,
    appSessionViewModel: AppSessionViewModel,
    logoutInProgress: Boolean,
    sharedText: String?,
    shareId: Long,
    onExitSharedCapture: () -> Unit,
) {
    when (state) {
        is AppSessionState.CheckingSession -> CheckingSessionScreen()
        is AppSessionState.Unauthorized -> {
            AuthNavGraph(onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) })
        }
        is AppSessionState.SessionCheckFailed -> {
            SessionCheckFailedScreen(
                failureKind = state.failureKind,
                onRetry = { appSessionViewModel.retrySessionCheck() },
                onSignIn = { appSessionViewModel.onSignInAfterRefreshFailure(state.userId, state.userEmail) },
            )
        }
        is AppSessionState.AuthorizedPendingAnkiSetup -> PendingAnkiSetupContent(appSessionViewModel)
        is AppSessionState.Authorized, is AppSessionState.AuthenticationRequired -> {
            AuthenticatedSessionContent(
                state = state,
                appSessionViewModel = appSessionViewModel,
                logoutInProgress = logoutInProgress,
                sharedText = sharedText,
                shareId = shareId,
                onExitSharedCapture = onExitSharedCapture,
            )
        }
    }
}

@Composable
private fun PendingAnkiSetupContent(appSessionViewModel: AppSessionViewModel) {
    val permissionLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission(),
        ) { }

    val setupViewModel: AnkiDroidSetupViewModel = hiltViewModel()
    val setupUiState by setupViewModel.uiState.collectAsState()
    LaunchedEffect(setupViewModel) {
        setupViewModel.setupCompleteEvent.collect { appSessionViewModel.onAnkiSetupFinished() }
    }
    LaunchedEffect(setupViewModel) {
        setupViewModel.skipEvent.collect { appSessionViewModel.onAnkiSetupFinished() }
    }
    AnkiDroidSetupScreen(
        uiState = setupUiState,
        onRequestPermission = {
            permissionLauncher.launch("com.ichi2.anki.permission.READ_WRITE_DATABASE")
        },
        onNoteTypeSelected = { name -> setupViewModel.onNoteTypeSelected(name) },
        onExportPreferenceSelected = { pref -> setupViewModel.onExportPreferenceSelected(pref) },
        onSave = { setupViewModel.onSave() },
        onSkip = { setupViewModel.onSkipSetup() },
        onResumeCheck = { setupViewModel.runSetupCheck() },
    )
}

@Composable
private fun AuthenticatedSessionContent(
    state: AppSessionState,
    appSessionViewModel: AppSessionViewModel,
    logoutInProgress: Boolean,
    sharedText: String?,
    shareId: Long,
    onExitSharedCapture: () -> Unit,
) {
    val userId: String
    val userEmail: String
    val required: AppSessionState.AuthenticationRequired?
    when (state) {
        is AppSessionState.Authorized -> {
            userId = state.userId
            userEmail = state.userEmail
            required = null
        }
        is AppSessionState.AuthenticationRequired -> {
            userId = state.userId
            userEmail = state.userEmail
            required = state
        }
        else -> error("AuthenticatedSessionContent requires an authenticated session")
    }
    val authNotice = required?.reason?.toAuthEntryNotice()
    if (required != null && !required.keepMainScreen) {
        AuthNavGraph(
            onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) },
            startAtLogin = true,
            notice = authNotice,
        )
    } else {
        MainScreen(
            userEmail = userEmail,
            onLogout = { appSessionViewModel.onLogout() },
            logoutInProgress = logoutInProgress,
            onUnauthorized = { appSessionViewModel.onSessionExpired(userId, userEmail) },
            sessionAuthNotice = authNotice,
            onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) },
            sharedText = sharedText,
            shareId = shareId,
            onExitSharedCapture = onExitSharedCapture,
        )
    }
}

private fun AppSessionState.AuthenticationRequiredReason.toAuthEntryNotice(): AuthEntryNotice =
    when (this) {
        AppSessionState.AuthenticationRequiredReason.SESSION_EXPIRED -> AuthEntryNotice.SESSION_EXPIRED
        AppSessionState.AuthenticationRequiredReason.REFRESH_UNAVAILABLE -> AuthEntryNotice.REFRESH_UNAVAILABLE
    }
