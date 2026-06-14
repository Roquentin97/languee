package com.example.langueedroid

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.AuthRepository
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.data.local.AuthSessionStore
import com.example.langueedroid.data.remote.ApiClient
import com.example.langueedroid.data.remote.AuthAuthenticator
import com.example.langueedroid.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.presentation.AppSessionState
import com.example.langueedroid.presentation.AppSessionViewModel
import com.example.langueedroid.ui.CheckingSessionScreen
import com.example.langueedroid.ui.MainScreen
import com.example.langueedroid.ui.ankidroid.AnkiDroidSetupScreen
import com.example.langueedroid.ui.auth.AuthNavGraph
import com.example.langueedroid.ui.theme.LangueeDroidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val sharedText: String? = if (intent?.action == Intent.ACTION_SEND &&
            intent.type == "text/plain"
        ) {
            intent.getStringExtra(Intent.EXTRA_TEXT)
        } else {
            null
        }

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
            openTelemetry = (applicationContext as LangueeDroidApp).openTelemetry,
        )
        val authApi = apiClient.createAuthApi()
        val authRepository = AuthRepository(
            authApi = authApi,
            sessionStore = sessionStore,
        )
        authRepositoryHolder = authRepository

        val deckRepository = DeckRepository(decksApi = apiClient.createDecksApi())
        val vocabularyRepository = VocabularyRepository(vocabularyApi = apiClient.createVocabularyApi())
        val cardRepository = CardRepository(cardsApi = apiClient.createCardsApi())

        val ankiDroidPreferencesStore = AnkiDroidPreferencesStore(applicationContext)
        val ankiDroidApiInstance = AnkiDroidApi(applicationContext)
        val ankiDroidExportServiceInstance = AnkiDroidExportService(applicationContext, ankiDroidApiInstance)
        val ankiDroidExportRepository = AnkiDroidExportRepository(apiClient.createAnkiDroidExportApi())

        val appSessionViewModelFactory = AppSessionViewModel.Factory(
            authRepository = authRepository,
            sessionStore = sessionStore,
            prefsStore = ankiDroidPreferencesStore,
        )

        setContent {
            LangueeDroidTheme {
                LangueeApp(
                    appSessionViewModelFactory = appSessionViewModelFactory,
                    authRepository = authRepository,
                    deckRepository = deckRepository,
                    vocabularyRepository = vocabularyRepository,
                    cardRepository = cardRepository,
                    sharedText = sharedText,
                    ankiDroidPreferencesStore = ankiDroidPreferencesStore,
                    ankiDroidApi = ankiDroidApiInstance,
                    ankiDroidExportService = ankiDroidExportServiceInstance,
                    ankiDroidExportRepository = ankiDroidExportRepository,
                )
            }
        }
    }
}

@Composable
private fun LangueeApp(
    appSessionViewModelFactory: AppSessionViewModel.Factory,
    authRepository: AuthRepository,
    deckRepository: DeckRepository,
    vocabularyRepository: VocabularyRepository,
    cardRepository: CardRepository,
    sharedText: String?,
    ankiDroidPreferencesStore: AnkiDroidPreferencesStore,
    ankiDroidApi: AnkiDroidApi,
    ankiDroidExportService: AnkiDroidExportService,
    ankiDroidExportRepository: AnkiDroidExportRepository,
) {
    val appSessionViewModel: AppSessionViewModel = viewModel(factory = appSessionViewModelFactory)
    val sessionState by appSessionViewModel.sessionState.collectAsState()
    val logoutInProgress by appSessionViewModel.logoutInProgress.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { }

    when (val state = sessionState) {
        is AppSessionState.CheckingSession -> {
            CheckingSessionScreen()
        }

        is AppSessionState.Unauthorized -> {
            AuthNavGraph(
                authRepository = authRepository,
                onAuthSuccess = { session -> appSessionViewModel.onAuthSuccess(session) },
            )
        }

        is AppSessionState.AuthorizedPendingAnkiSetup -> {
            val setupViewModel: AnkiDroidSetupViewModel = viewModel(
                factory = AnkiDroidSetupViewModel.Factory(
                    applicationContext = androidx.compose.ui.platform.LocalContext.current.applicationContext,
                    exportService = ankiDroidExportService,
                    prefsStore = ankiDroidPreferencesStore,
                    ankiDroidApi = ankiDroidApi,
                    onSetupComplete = { appSessionViewModel.onAnkiSetupFinished() },
                    onSkip = { appSessionViewModel.onAnkiSetupFinished() },
                ),
            )
            val setupUiState by setupViewModel.uiState.collectAsState()
            AnkiDroidSetupScreen(
                uiState = setupUiState,
                onRequestPermission = {
                    permissionLauncher.launch("com.ichi2.anki.permission.READ_WRITE_DATABASE")
                    setupViewModel.onPermissionGranted()
                },
                onCreateDedicatedDeck = { setupViewModel.onCreateDedicatedDeck() },
                onLoadDecks = { setupViewModel.loadAvailableDecks() },
                onDeckSelected = { id, name -> setupViewModel.onDeckSelected(id, name) },
                onNoteTypeSelected = { name -> setupViewModel.onNoteTypeSelected(name) },
                onExportPreferenceSelected = { pref -> setupViewModel.onExportPreferenceSelected(pref) },
                onSave = { setupViewModel.onSave() },
                onSkip = { setupViewModel.onSkipSetup() },
            )
        }

        is AppSessionState.Authorized -> {
            MainScreen(
                userEmail = state.userEmail,
                onLogout = { appSessionViewModel.onLogout() },
                logoutInProgress = logoutInProgress,
                deckRepository = deckRepository,
                vocabularyRepository = vocabularyRepository,
                cardRepository = cardRepository,
                onUnauthorized = { appSessionViewModel.onLogout() },
                sharedText = sharedText,
                ankiDroidPreferencesStore = ankiDroidPreferencesStore,
                ankiDroidExportService = ankiDroidExportService,
                ankiDroidExportRepository = ankiDroidExportRepository,
                ankiDroidApi = ankiDroidApi,
            )
        }
    }
}
