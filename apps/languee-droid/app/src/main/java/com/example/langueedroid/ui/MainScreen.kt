package com.example.langueedroid.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.langueedroid.R
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.AnkiDroidSetupIssue
import com.example.langueedroid.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.presentation.AppState
import com.example.langueedroid.presentation.CardCreationViewModel
import com.example.langueedroid.presentation.DecksViewModel
import com.example.langueedroid.presentation.MainViewModel
import com.example.langueedroid.presentation.SyncViewModel
import com.example.langueedroid.ui.ankidroid.AnkiDroidSetupScreen
import com.example.langueedroid.ui.ankidroid.AnkiDroidSyncScreen
import kotlinx.coroutines.launch

@Composable
fun MainScreen(
    userEmail: String,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    onUnauthorized: () -> Unit,
    sharedText: String?,
    modifier: Modifier = Modifier,
) {
    val mainViewModel: MainViewModel = hiltViewModel()

    LaunchedEffect(sharedText) {
        if (!sharedText.isNullOrBlank()) {
            mainViewModel.startSharedTextCapture(sharedText)
        }
    }

    val state by mainViewModel.state.collectAsState()

    // Detect AnkiDroid dependency state changes while the app is in the foreground.
    var ankiStatusNotification by remember { mutableStateOf<AnkiStatusNotification?>(null) }
    var previousAnkiResult by remember { mutableStateOf<AnkiDroidSetupCheckResult?>(null) }
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                scope.launch {
                    val current = mainViewModel.checkAnkiSetupStatus()
                    val prev = previousAnkiResult
                    if (prev != null) {
                        val notification = detectAnkiStatusChange(prev, current)
                        if (notification != null) ankiStatusNotification = notification
                    }
                    previousAnkiResult = current
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    ankiStatusNotification?.let { notification ->
        AnkiStatusChangeDialog(
            notification = notification,
            onDismiss = { ankiStatusNotification = null },
            onSetupNow = {
                ankiStatusNotification = null
                mainViewModel.goToAnkiDroidSetup()
            },
        )
    }

    when (val currentState = state) {
        is AppState.Screen.Decks -> {
            val decksViewModel: DecksViewModel = hiltViewModel()
            LaunchedEffect(decksViewModel) {
                decksViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            val decksState by decksViewModel.decksState.collectAsState()
            val availableAnkiDecks by decksViewModel.availableAnkiDecks.collectAsState()
            val isLoadingAnkiDecks by decksViewModel.isLoadingAnkiDecks.collectAsState()
            DecksScreen(
                state = decksState,
                onDeckClick = { _ ->
                    mainViewModel.startManualAdd()
                },
                onCreateDeck = { name ->
                    decksViewModel.createDeck(name, onCreated = {})
                },
                onLogout = onLogout,
                logoutInProgress = logoutInProgress,
                onSyncClick = { mainViewModel.goToAnkiDroidSync() },
                onIntegrationsClick = { mainViewModel.goToAnkiDroidSetup() },
                availableAnkiDecks = availableAnkiDecks,
                isLoadingAnkiDecks = isLoadingAnkiDecks,
                onLoadAnkiDecks = { decksViewModel.loadAnkiDecks() },
                modifier = modifier,
            )
        }

        is AppState.Screen.AnkiDroidSetup -> {
            val setupViewModel: AnkiDroidSetupViewModel = hiltViewModel()
            LaunchedEffect(setupViewModel) {
                setupViewModel.setupCompleteEvent.collect {
                    mainViewModel.exitAnkiDroidSetup()
                }
            }
            LaunchedEffect(setupViewModel) {
                setupViewModel.skipEvent.collect {
                    mainViewModel.exitAnkiDroidSetup()
                }
            }
            val setupUiState by setupViewModel.uiState.collectAsState()
            val setupPermLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestPermission(),
            ) { setupViewModel.onPermissionGranted() }
            AnkiDroidSetupScreen(
                uiState = setupUiState,
                showBackButton = true,
                onNavigateBack = { mainViewModel.exitAnkiDroidSetup() },
                onRequestPermission = {
                    setupPermLauncher.launch("com.ichi2.anki.permission.READ_WRITE_DATABASE")
                },
                onNoteTypeSelected = { name -> setupViewModel.onNoteTypeSelected(name) },
                onExportPreferenceSelected = { pref -> setupViewModel.onExportPreferenceSelected(pref) },
                onSave = { setupViewModel.onSave() },
                onSkip = { setupViewModel.onSkipSetup() },
                onResumeCheck = { setupViewModel.runSetupCheck() },
                modifier = modifier,
            )
        }

        is AppState.Screen.AnkiDroidSync -> {
            val syncViewModel: SyncViewModel = hiltViewModel()
            val syncUiState by syncViewModel.uiState.collectAsState()
            AnkiDroidSyncScreen(
                uiState = syncUiState,
                onSync = { syncViewModel.sync() },
                onDismissResult = { syncViewModel.dismissResult() },
                onNavigateBack = { mainViewModel.exitAnkiDroidSync() },
                modifier = modifier,
            )
        }

        is AppState.Screen.CardCreation -> {
            val cardCreationViewModel: CardCreationViewModel = hiltViewModel<CardCreationViewModel, CardCreationViewModel.Factory>(
                key = "${currentState.targetWord}:${currentState.context}",
            ) { factory ->
                factory.create(
                    targetWord = currentState.targetWord,
                    context = currentState.context,
                )
            }
            LaunchedEffect(cardCreationViewModel) {
                cardCreationViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            LaunchedEffect(cardCreationViewModel) {
                cardCreationViewModel.cardCreatedEvent.collect {
                    mainViewModel.dismissCapture()
                }
            }
            val cardCreationState by cardCreationViewModel.state.collectAsState()
            CardCreationScreen(
                state = cardCreationState,
                onDeckSelected = { deck -> cardCreationViewModel.onDeckSelected(deck) },
                onDefinitionSelected = { def -> cardCreationViewModel.onDefinitionSelected(def) },
                onExampleConfirmed = { example -> cardCreationViewModel.onExampleConfirmed(example) },
                onBackFromExampleSelection = { cardCreationViewModel.onBackFromExampleSelection() },
                onCreateCard = { cardCreationViewModel.createCard() },
                onRetryLookup = { cardCreationViewModel.retryLookup() },
                onNavigateBack = { mainViewModel.dismissCapture() },
                modifier = modifier,
            )
        }

        is AppState.Screen.ManualCapture,
        is AppState.Screen.SharedWordCapture,
        is AppState.Screen.SharedContextCapture,
        is AppState.Screen.ContextReview,
        is AppState.Screen.ContextEdit,
        -> CaptureScreen(
            state = currentState as AppState.Screen,
            onAddEntry = { word, context -> mainViewModel.addEntry(word, context) },
            onStartManualAdd = { mainViewModel.startManualAdd() },
            onSelectTargetWord = { token -> mainViewModel.selectTargetWord(token) },
            onConfirmTruncation = { mainViewModel.confirmTruncation() },
            onKeepFullContext = { mainViewModel.keepFullContext() },
            onEditContext = {
                val reviewState = currentState as? AppState.Screen.ContextReview
                if (reviewState != null) {
                    mainViewModel.startContextEdit(reviewState.targetWord, reviewState.context)
                }
            },
            onDismiss = { mainViewModel.dismissCapture() },
            onContextEditSave = { editedContext -> mainViewModel.onContextEditSave(editedContext) },
            onConfirmSaveWithoutContext = {
                val editState = currentState as? AppState.Screen.ContextEdit
                if (editState != null) {
                    mainViewModel.confirmSaveWithoutContext(editState.targetWord)
                }
            },
            modifier = modifier,
        )

    }
}

private sealed class AnkiStatusNotification {
    object AnkiDroidInstalled : AnkiStatusNotification()
    object AnkiDroidUninstalled : AnkiStatusNotification()
    object PermissionGranted : AnkiStatusNotification()
    object PermissionRevoked : AnkiStatusNotification()
}

private fun detectAnkiStatusChange(
    previous: AnkiDroidSetupCheckResult,
    current: AnkiDroidSetupCheckResult,
): AnkiStatusNotification? {
    val prevNotInstalled = previous.issues.any { it is AnkiDroidSetupIssue.NotInstalled }
    val currNotInstalled = current.issues.any { it is AnkiDroidSetupIssue.NotInstalled }
    val prevPermDenied = previous.issues.any { it is AnkiDroidSetupIssue.PermissionDenied }
    val currPermDenied = current.issues.any { it is AnkiDroidSetupIssue.PermissionDenied }

    return when {
        prevNotInstalled && !currNotInstalled -> AnkiStatusNotification.AnkiDroidInstalled
        !prevNotInstalled && currNotInstalled -> AnkiStatusNotification.AnkiDroidUninstalled
        prevPermDenied && !currPermDenied -> AnkiStatusNotification.PermissionGranted
        !prevPermDenied && currPermDenied -> AnkiStatusNotification.PermissionRevoked
        else -> null
    }
}

@Composable
private fun AnkiStatusChangeDialog(
    notification: AnkiStatusNotification,
    onDismiss: () -> Unit,
    onSetupNow: () -> Unit,
) {
    val title: String
    val message: String
    val showSetupAction: Boolean

    when (notification) {
        AnkiStatusNotification.AnkiDroidInstalled -> {
            title = stringResource(R.string.ankidroid_installed_title)
            message = stringResource(R.string.ankidroid_installed_message)
            showSetupAction = true
        }
        AnkiStatusNotification.AnkiDroidUninstalled -> {
            title = stringResource(R.string.ankidroid_uninstalled_title)
            message = stringResource(R.string.ankidroid_uninstalled_message)
            showSetupAction = false
        }
        AnkiStatusNotification.PermissionGranted -> {
            title = stringResource(R.string.ankidroid_permission_granted_title)
            message = stringResource(R.string.ankidroid_permission_granted_message)
            showSetupAction = true
        }
        AnkiStatusNotification.PermissionRevoked -> {
            title = stringResource(R.string.ankidroid_permission_revoked_title)
            message = stringResource(R.string.ankidroid_permission_revoked_message)
            showSetupAction = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            if (showSetupAction) {
                TextButton(onClick = onSetupNow) {
                    Text(stringResource(R.string.ankidroid_status_setup_now))
                }
            } else {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.ankidroid_status_ok))
                }
            }
        },
        dismissButton = if (showSetupAction) {
            { TextButton(onClick = onDismiss) { Text(stringResource(R.string.ankidroid_status_not_now)) } }
        } else {
            null
        },
    )
}
