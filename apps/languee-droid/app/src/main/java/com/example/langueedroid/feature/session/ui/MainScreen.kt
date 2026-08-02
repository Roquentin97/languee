package com.example.langueedroid.feature.session.ui

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.languee.droid.R
import com.example.langueedroid.feature.anki.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.feature.anki.presentation.SyncViewModel
import com.example.langueedroid.feature.anki.ui.AnkiDroidSetupScreen
import com.example.langueedroid.feature.anki.ui.AnkiDroidSyncScreen
import com.example.langueedroid.feature.capture.presentation.AnkiStatusNotification
import com.example.langueedroid.feature.capture.presentation.MainViewModel
import com.example.langueedroid.feature.capture.ui.CaptureScreen
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationViewModel
import com.example.langueedroid.feature.cardcreation.ui.CardCreationScreen
import com.example.langueedroid.feature.decks.presentation.DeckDetailViewModel
import com.example.langueedroid.feature.decks.presentation.DecksViewModel
import com.example.langueedroid.feature.decks.ui.DeckDetailScreen
import com.example.langueedroid.feature.decks.ui.DecksScreen
import com.example.langueedroid.feature.offline.presentation.OfflineQueueViewModel
import com.example.langueedroid.feature.offline.ui.OfflineQueueScreen
import com.example.langueedroid.feature.review.presentation.ReviewViewModel
import com.example.langueedroid.feature.review.ui.ReviewScreen
import java.net.URLDecoder

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
    val navController = rememberNavController()

    LaunchedEffect(sharedText) {
        if (!sharedText.isNullOrBlank()) {
            mainViewModel.startSharedTextCapture(sharedText)
            navController.navigate(MainNavRoutes.CAPTURE) {
                popUpTo(MainNavRoutes.DECKS) { inclusive = false }
            }
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.cardCreationRequest.collect { request ->
            val route = MainNavRoutes.cardCreation(request.targetWord, request.context, language = request.language)
            navController.navigate(route) {
                popUpTo(MainNavRoutes.CAPTURE) { inclusive = false }
            }
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.offlineWordSaved.collect {
            mainViewModel.dismissCapture()
            navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.navigateToAnkiSetup.collect {
            navController.navigate(MainNavRoutes.ANKI_SETUP)
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.navigateToAnkiSync.collect {
            navController.navigate(MainNavRoutes.ANKI_SYNC)
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                mainViewModel.onResumeCheckAnkiStatus()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val ankiStatusNotification by mainViewModel.ankiStatusNotification.collectAsState()
    ankiStatusNotification?.let { notification ->
        AnkiStatusChangeDialog(
            notification = notification,
            onDismiss = { mainViewModel.dismissAnkiStatusNotification() },
            onSetupNow = {
                mainViewModel.dismissAnkiStatusNotification()
                mainViewModel.goToAnkiDroidSetup()
            },
        )
    }

    val isOffline by mainViewModel.isOffline.collectAsState()
    val offlineQueueCount by mainViewModel.offlineQueueCount.collectAsState()

    NavHost(
        navController = navController,
        startDestination = MainNavRoutes.DECKS,
        modifier = modifier,
    ) {
        composable(MainNavRoutes.DECKS) {
            val decksViewModel: DecksViewModel = hiltViewModel()
            LaunchedEffect(decksViewModel) {
                decksViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            // Refresh the due-review badge every time the Decks screen re-enters composition
            // (e.g. returning from a review session), not just on first load.
            LaunchedEffect(Unit) {
                decksViewModel.loadDueReviewCount()
            }
            val decksState by decksViewModel.decksState.collectAsState()
            val availableAnkiDecks by decksViewModel.availableAnkiDecks.collectAsState()
            val isLoadingAnkiDecks by decksViewModel.isLoadingAnkiDecks.collectAsState()
            val dueReviewCount by decksViewModel.dueReviewCount.collectAsState()
            DecksScreen(
                state = decksState,
                onDeckClick = { deck ->
                    navController.navigate(MainNavRoutes.review(deck.id))
                },
                onDeckBrowseClick = { deck ->
                    navController.navigate(MainNavRoutes.deckDetail(deck.id, deck.name))
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
                onReviewClick = { navController.navigate(MainNavRoutes.review()) },
                dueReviewCount = dueReviewCount,
                isOffline = isOffline,
                offlineQueueCount = offlineQueueCount,
                onOfflineStripClick = { navController.navigate(MainNavRoutes.OFFLINE_QUEUE) },
            )
        }

        composable(
            route = MainNavRoutes.DECK_DETAIL,
            arguments = listOf(
                navArgument("deckId") { type = NavType.StringType },
                navArgument("deckName") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val deckId = URLDecoder.decode(
                backStackEntry.arguments?.getString("deckId") ?: "",
                "UTF-8",
            )
            val deckName = URLDecoder.decode(
                backStackEntry.arguments?.getString("deckName") ?: "",
                "UTF-8",
            )
            val deckDetailViewModel: DeckDetailViewModel = hiltViewModel<DeckDetailViewModel, DeckDetailViewModel.Factory>(
                key = "deck_detail:$deckId",
            ) { factory ->
                factory.create(deckId = deckId)
            }
            LaunchedEffect(deckDetailViewModel) {
                deckDetailViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            val deckDetailState by deckDetailViewModel.state.collectAsState()
            DeckDetailScreen(
                deckName = deckName,
                state = deckDetailState,
                onAddWord = {
                    mainViewModel.startManualAdd()
                    navController.navigate(MainNavRoutes.CAPTURE)
                },
                onRetry = { deckDetailViewModel.loadCards() },
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(MainNavRoutes.CAPTURE) {
            val captureState by mainViewModel.state.collectAsState()
            CaptureScreen(
                state = captureState as? com.example.langueedroid.feature.capture.presentation.AppState.Screen
                    ?: com.example.langueedroid.feature.capture.presentation.AppState.Screen.ManualCapture(),
                onAddEntry = { word, context -> mainViewModel.addEntry(word, context) },
                onStartManualAdd = { mainViewModel.startManualAdd() },
                onWordTokenTapped = { index -> mainViewModel.onWordTokenTapped(index) },
                onConfirmWordSelection = { mainViewModel.confirmWordSelection() },
                onConfirmTruncation = { mainViewModel.confirmTruncation() },
                onKeepFullContext = { mainViewModel.keepFullContext() },
                onEditContext = {
                    val reviewState = captureState as?
                        com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextReview
                    if (reviewState != null) {
                        mainViewModel.startContextEdit(reviewState.targetWord, reviewState.context)
                    }
                },
                onDismiss = {
                    mainViewModel.dismissCapture()
                    navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
                },
                onContextEditSave = { editedContext -> mainViewModel.onContextEditSave(editedContext) },
                onConfirmSaveWithoutContext = {
                    val editState = captureState as?
                        com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextEdit
                    if (editState != null) {
                        mainViewModel.confirmSaveWithoutContext(editState.targetWord)
                    }
                },
                onSelectLanguage = { code -> mainViewModel.selectLanguage(code) },
            )
        }

        composable(
            route = MainNavRoutes.CARD_CREATION,
            arguments = listOf(
                navArgument("word") { type = NavType.StringType },
                navArgument("context") { type = NavType.StringType },
                navArgument("offlineEntryId") { type = NavType.StringType },
                navArgument("language") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val encodedWord = backStackEntry.arguments?.getString("word") ?: ""
            val encodedContext = backStackEntry.arguments?.getString("context") ?: ""
            val encodedOfflineEntryId = backStackEntry.arguments?.getString("offlineEntryId") ?: ""
            val encodedLanguage = backStackEntry.arguments?.getString("language") ?: ""
            val targetWord = URLDecoder.decode(encodedWord, "UTF-8")
            val context = URLDecoder.decode(encodedContext, "UTF-8").ifEmpty { null }
            val offlineEntryId = URLDecoder.decode(encodedOfflineEntryId, "UTF-8").ifEmpty { null }
            val language = URLDecoder.decode(encodedLanguage, "UTF-8").ifEmpty { "en" }

            val cardCreationViewModel: CardCreationViewModel = hiltViewModel<CardCreationViewModel, CardCreationViewModel.Factory>(
                key = "$targetWord:$context:$language",
            ) { factory ->
                factory.create(targetWord = targetWord, context = context, language = language)
            }
            LaunchedEffect(cardCreationViewModel) {
                cardCreationViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            LaunchedEffect(cardCreationViewModel) {
                cardCreationViewModel.cardCreatedEvent.collect {
                    if (offlineEntryId != null) {
                        mainViewModel.removeOfflineEntry(offlineEntryId)
                        mainViewModel.dismissCapture()
                        navController.popBackStack(MainNavRoutes.OFFLINE_QUEUE, inclusive = false)
                    } else {
                        mainViewModel.dismissCapture()
                        navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
                    }
                }
            }
            val cardCreationState by cardCreationViewModel.state.collectAsState()
            CardCreationScreen(
                state = cardCreationState,
                speaker = cardCreationViewModel.speaker,
                onDeckSelected = { deck -> cardCreationViewModel.onDeckSelected(deck) },
                onDefinitionSelected = { def -> cardCreationViewModel.onDefinitionSelected(def) },
                onExampleConfirmed = { example -> cardCreationViewModel.onExampleConfirmed(example) },
                onBackFromExampleSelection = { cardCreationViewModel.onBackFromExampleSelection() },
                onCreateCard = { cardCreationViewModel.createCard() },
                onRetryLookup = { cardCreationViewModel.retryLookup() },
                onNavigateBack = {
                    mainViewModel.dismissCapture()
                    if (offlineEntryId != null) {
                        navController.popBackStack(MainNavRoutes.OFFLINE_QUEUE, inclusive = false)
                    } else {
                        navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
                    }
                },
                onManualDefinitionTextChanged = { text -> cardCreationViewModel.onManualDefinitionTextChanged(text) },
                onManualExampleTextChanged = { text -> cardCreationViewModel.onManualExampleTextChanged(text) },
                onSubmitManualDefinition = { cardCreationViewModel.submitManualDefinition() },
            )
        }

        composable(MainNavRoutes.ANKI_SETUP) {
            val setupViewModel: AnkiDroidSetupViewModel = hiltViewModel()
            LaunchedEffect(setupViewModel) {
                setupViewModel.setupCompleteEvent.collect {
                    navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
                }
            }
            LaunchedEffect(setupViewModel) {
                setupViewModel.skipEvent.collect {
                    navController.popBackStack(MainNavRoutes.DECKS, inclusive = false)
                }
            }
            val setupUiState by setupViewModel.uiState.collectAsState()
            val setupPermLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestPermission(),
            ) { setupViewModel.onPermissionGranted() }
            AnkiDroidSetupScreen(
                uiState = setupUiState,
                showBackButton = true,
                onNavigateBack = { navController.popBackStack() },
                onRequestPermission = {
                    setupPermLauncher.launch("com.ichi2.anki.permission.READ_WRITE_DATABASE")
                },
                onNoteTypeSelected = { name -> setupViewModel.onNoteTypeSelected(name) },
                onExportPreferenceSelected = { pref -> setupViewModel.onExportPreferenceSelected(pref) },
                onSave = { setupViewModel.onSave() },
                onSkip = { setupViewModel.onSkipSetup() },
                onResumeCheck = { setupViewModel.runSetupCheck() },
            )
        }

        composable(MainNavRoutes.ANKI_SYNC) {
            val syncViewModel: SyncViewModel = hiltViewModel()
            val syncUiState by syncViewModel.uiState.collectAsState()
            AnkiDroidSyncScreen(
                uiState = syncUiState,
                onSync = { syncViewModel.sync() },
                onDismissResult = { syncViewModel.dismissResult() },
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(
            route = MainNavRoutes.REVIEW,
            arguments = listOf(
                navArgument("deckId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStackEntry ->
            val deckId = backStackEntry.arguments?.getString("deckId")?.let {
                URLDecoder.decode(it, "UTF-8")
            }
            val reviewViewModel: ReviewViewModel = hiltViewModel<ReviewViewModel, ReviewViewModel.Factory>(
                key = "review:${deckId ?: "all"}",
            ) { factory ->
                factory.create(deckId = deckId)
            }
            LaunchedEffect(reviewViewModel) {
                reviewViewModel.unauthorizedEvent.collect {
                    onUnauthorized()
                }
            }
            val reviewState by reviewViewModel.state.collectAsState()
            ReviewScreen(
                state = reviewState,
                speaker = reviewViewModel.speaker,
                onInputChange = { text -> reviewViewModel.updateInput(text) },
                onSubmit = { reviewViewModel.submitAnswer() },
                onReveal = { reviewViewModel.reveal() },
                onGrade = { rating -> reviewViewModel.grade(rating) },
                onContinue = { reviewViewModel.next() },
                onRetry = { reviewViewModel.retry() },
                onDone = { navController.popBackStack(MainNavRoutes.DECKS, inclusive = false) },
                onNavigateBack = { navController.popBackStack(MainNavRoutes.DECKS, inclusive = false) },
            )
        }

        composable(MainNavRoutes.OFFLINE_QUEUE) {
            val offlineQueueViewModel: OfflineQueueViewModel = hiltViewModel()
            LaunchedEffect(offlineQueueViewModel) {
                offlineQueueViewModel.navigateToCardCreation.collect { request ->
                    val route = MainNavRoutes.cardCreation(
                        word = request.word,
                        context = request.context,
                        offlineEntryId = request.entryId,
                    )
                    navController.navigate(route)
                }
            }
            val offlineQueueState by offlineQueueViewModel.state.collectAsState()
            OfflineQueueScreen(
                state = offlineQueueState,
                onEntryClick = { entry -> offlineQueueViewModel.onEntrySelected(entry) },
                onStartReviewing = { offlineQueueViewModel.onStartReviewing() },
                onNavigateBack = { navController.popBackStack() },
            )
        }
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
