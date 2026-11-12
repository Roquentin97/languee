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
import com.example.langueedroid.feature.auth.ui.AuthNavGraph
import com.example.langueedroid.feature.session.presentation.AppSessionState
import com.example.langueedroid.feature.session.presentation.AppSessionViewModel
import com.example.langueedroid.feature.session.ui.CheckingSessionScreen
import com.example.langueedroid.feature.session.ui.MainScreen
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

    val permissionLauncher =
        rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission(),
        ) { }

    when (val state = sessionState) {
        is AppSessionState.CheckingSession -> {
            CheckingSessionScreen()
        }

        is AppSessionState.Unauthorized -> {
            AuthNavGraph(
                onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) },
            )
        }

        is AppSessionState.AuthorizedPendingAnkiSetup -> {
            val setupViewModel: AnkiDroidSetupViewModel = hiltViewModel()
            val setupUiState by setupViewModel.uiState.collectAsState()
            LaunchedEffect(setupViewModel) {
                setupViewModel.setupCompleteEvent.collect {
                    appSessionViewModel.onAnkiSetupFinished()
                }
            }
            LaunchedEffect(setupViewModel) {
                setupViewModel.skipEvent.collect {
                    appSessionViewModel.onAnkiSetupFinished()
                }
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

        is AppSessionState.Authorized -> {
            MainScreen(
                userEmail = state.userEmail,
                onLogout = { appSessionViewModel.onLogout() },
                logoutInProgress = logoutInProgress,
                onUnauthorized = { appSessionViewModel.onLogout() },
                sharedText = sharedText,
                shareId = shareId,
                onExitSharedCapture = onExitSharedCapture,
            )
        }
    }
}
