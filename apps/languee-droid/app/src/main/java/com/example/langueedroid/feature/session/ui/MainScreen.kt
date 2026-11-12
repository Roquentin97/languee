package com.example.langueedroid.feature.session.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.langueedroid.feature.anki.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.feature.anki.presentation.SyncViewModel
import com.example.langueedroid.feature.anki.ui.AnkiDroidSetupScreen
import com.example.langueedroid.feature.anki.ui.AnkiDroidSyncScreen
import com.example.langueedroid.feature.capture.presentation.AnkiStatusNotification
import com.example.langueedroid.feature.capture.presentation.MainViewModel
import com.example.langueedroid.feature.capture.ui.CaptureScreen
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationError
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
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
import com.languee.droid.R
import java.net.URLDecoder

@Composable
fun MainScreen(
    userEmail: String,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    onUnauthorized: () -> Unit,
    sharedText: String?,
    shareId: Long = 0L,
    onExitSharedCapture: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val mainViewModel: MainViewModel = hiltViewModel()
    LaunchedEffect(mainViewModel) { mainViewModel.unauthorizedEvent.collect { onUnauthorized() } }
    val navController = rememberNavController()
    val context = LocalContext.current
    LaunchedEffect(mainViewModel, context) {
        mainViewModel.exportFailures.collect {
            Toast.makeText(context, "Added to deck. AnkiDroid sync needs attention; check Sync.", Toast.LENGTH_LONG).show()
        }
    }

    val offlineQueueError by mainViewModel.offlineQueueError.collectAsState()
    if (offlineQueueError) {
        AlertDialog(
            onDismissRequest = { mainViewModel.dismissOfflineQueueError() },
            title = { Text("Could not queue word") },
            text = { Text("Your word could not be saved for offline review. Please try again.") },
            confirmButton = { TextButton(onClick = { mainViewModel.dismissOfflineQueueError() }) { Text("OK") } },
        )
    }

    ObserveMainNavigation(sharedText, shareId, mainViewModel, navController, onExitSharedCapture)

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
        decksRoute(navController, mainViewModel, onUnauthorized, onLogout, logoutInProgress, isOffline, offlineQueueCount)
        deckDetailRoute(navController, mainViewModel, onUnauthorized)
        captureRoute(navController, mainViewModel, onExitSharedCapture)
        cardCreationRoute(navController, mainViewModel, onUnauthorized, onExitSharedCapture)
        ankiSetupRoute(navController)
        ankiSyncRoute(navController)
        reviewRoute(navController, onUnauthorized)
        offlineQueueRoute(navController)
    }
}

@Composable
private fun ObserveMainNavigation(
    sharedText: String?,
    shareId: Long,
    mainViewModel: MainViewModel,
    navController: NavHostController,
    onExitSharedCapture: () -> Unit,
) {
    var handledShareId by rememberSaveable { mutableStateOf(-1L) }
    LaunchedEffect(sharedText, shareId) {
        if (handledShareId != shareId && !sharedText.isNullOrBlank()) {
            handledShareId = shareId
            mainViewModel.startSharedTextCapture(sharedText)
            navController.navigate(MainNavRoutes.CAPTURE) {
                popUpTo(MainNavRoutes.DECKS) { inclusive = false }
            }
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.cardCreationRequest.collect { request ->
            if (request.sessionId != mainViewModel.sessionId) return@collect
            val route = MainNavRoutes.cardCreation(request.targetWord, request.context, language = request.language)
            navController.navigate(route) {
                popUpTo(MainNavRoutes.CAPTURE) { inclusive = false }
            }
        }
    }

    LaunchedEffect(mainViewModel) {
        mainViewModel.offlineWordSaved.collect { generation ->
            if (generation != mainViewModel.sessionId) return@collect
            endCapture(mainViewModel, onExitSharedCapture) { navController.popBackStack(MainNavRoutes.DECKS, inclusive = false) }
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
        val observer =
            LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) {
                    mainViewModel.onResumeCheckAnkiStatus()
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

private fun endCapture(
    mainViewModel: MainViewModel,
    onExitSharedCapture: () -> Unit,
    navigate: () -> Unit,
) {
    val external = mainViewModel.fromExternalShare
    mainViewModel.dismissCapture()
    if (external) onExitSharedCapture() else navigate()
}

private fun NavGraphBuilder.decksRoute(
    navController: NavHostController,
    mainViewModel: MainViewModel,
    onUnauthorized: () -> Unit,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    isOffline: Boolean,
    offlineQueueCount: Int,
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
            onAddWord = {
                mainViewModel.startManualAdd()
                navController.navigate(MainNavRoutes.CAPTURE)
            },
            onCaptureText = {
                mainViewModel.startTextInput()
                navController.navigate(MainNavRoutes.CAPTURE)
            },
        )
    }
}

private fun NavGraphBuilder.deckDetailRoute(
    navController: NavHostController,
    mainViewModel: MainViewModel,
    onUnauthorized: () -> Unit,
) {
    composable(
        route = MainNavRoutes.DECK_DETAIL,
        arguments =
            listOf(
                navArgument("deckId") { type = NavType.StringType },
                navArgument("deckName") { type = NavType.StringType },
            ),
    ) { backStackEntry ->
        val deckId =
            URLDecoder.decode(
                backStackEntry.arguments?.getString("deckId") ?: "",
                "UTF-8",
            )
        val deckName =
            URLDecoder.decode(
                backStackEntry.arguments?.getString("deckName") ?: "",
                "UTF-8",
            )
        val deckDetailViewModel: DeckDetailViewModel =
            hiltViewModel<DeckDetailViewModel, DeckDetailViewModel.Factory>(
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
                mainViewModel.startManualAdd(deckId = deckId)
                navController.navigate(MainNavRoutes.CAPTURE)
            },
            onRetry = { deckDetailViewModel.loadCards() },
            onNavigateBack = { navController.popBackStack() },
        )
    }
}

private fun NavGraphBuilder.captureRoute(
    navController: NavHostController,
    mainViewModel: MainViewModel,
    onExitSharedCapture: () -> Unit,
) {
    composable(MainNavRoutes.CAPTURE) {
        val captureState by mainViewModel.state.collectAsState()
        LaunchedEffect(captureState) {
            val sharedWord = captureState as? com.example.langueedroid.feature.capture.presentation.AppState.Screen.SharedWordCapture
            if (sharedWord != null) mainViewModel.addEntry(sharedWord.word, null)
        }
        BackHandler {
            if (!mainViewModel.returnToCapture()) {
                endCapture(mainViewModel, onExitSharedCapture) { navController.popBackStack() }
            } else if (captureState is com.example.langueedroid.feature.capture.presentation.AppState.Screen.SharedContextCapture) {
                endCapture(mainViewModel, onExitSharedCapture) { navController.popBackStack() }
            }
        }
        CaptureScreen(
            state =
                captureState as? com.example.langueedroid.feature.capture.presentation.AppState.Screen
                    ?: com.example.langueedroid.feature.capture.presentation.AppState.Screen
                        .ManualCapture(),
            onAddEntry = { word, context -> mainViewModel.addEntry(word, context) },
            onStartManualAdd = { prefilledWord -> mainViewModel.startManualAdd(prefilledWord) },
            onWordTokenTapped = { index -> mainViewModel.onWordTokenTapped(index) },
            onConfirmWordSelection = { mainViewModel.confirmWordSelection() },
            onConfirmTruncation = { mainViewModel.confirmTruncation() },
            onKeepFullContext = { mainViewModel.keepFullContext() },
            onEditContext = {
                val reviewState =
                    captureState as?
                        com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextReview
                if (reviewState != null) {
                    mainViewModel.startContextEdit(reviewState.targetWord, reviewState.context)
                }
            },
            onDismiss = {
                val reviewing =
                    captureState is com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextReview ||
                        captureState is com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextEdit
                if (!reviewing || !mainViewModel.returnToCapture()) {
                    endCapture(mainViewModel, onExitSharedCapture) { navController.popBackStack() }
                }
            },
            onContextEditSave = { editedContext -> mainViewModel.onContextEditSave(editedContext) },
            onConfirmSaveWithoutContext = {
                val editState =
                    captureState as?
                        com.example.langueedroid.feature.capture.presentation.AppState.Screen.ContextEdit
                if (editState != null) {
                    mainViewModel.confirmSaveWithoutContext(editState.targetWord)
                }
            },
            onSelectLanguage = { code -> mainViewModel.selectLanguage(code) },
            onStartTextWorkspace = { text -> mainViewModel.startTextWorkspace(text) },
        )
    }
}

private fun NavGraphBuilder.cardCreationRoute(
    navController: NavHostController,
    mainViewModel: MainViewModel,
    onUnauthorized: () -> Unit,
    onExitSharedCapture: () -> Unit,
) {
    composable(
        route = MainNavRoutes.CARD_CREATION,
        arguments =
            listOf(
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

        val cardCreationViewModel: CardCreationViewModel =
            hiltViewModel<CardCreationViewModel, CardCreationViewModel.Factory>(
                key = "$targetWord:$context:$language",
            ) { factory ->
                factory.create(targetWord = targetWord, context = context, language = language)
            }
        val captureSessionId = remember(cardCreationViewModel) { mainViewModel.sessionId }
        LaunchedEffect(cardCreationViewModel) {
            cardCreationViewModel.unauthorizedEvent.collect {
                onUnauthorized()
            }
        }
        LaunchedEffect(cardCreationViewModel) {
            cardCreationViewModel.cardCreatedEvent.collect { result ->
                if (navController.currentBackStackEntry != backStackEntry) return@collect
                if (offlineEntryId != null) {
                    mainViewModel.removeOfflineEntry(offlineEntryId)
                    mainViewModel.dismissCapture()
                    navController.popBackStack(MainNavRoutes.OFFLINE_QUEUE, inclusive = false)
                } else if (captureSessionId == mainViewModel.sessionId) {
                    if (mainViewModel.captureCompleted(result.definition, result.deck, result.cardId)) {
                        navController.popBackStack(MainNavRoutes.CAPTURE, inclusive = false)
                    } else {
                        endCapture(mainViewModel, onExitSharedCapture) {
                            navController.popBackStack(MainNavRoutes.CAPTURE, inclusive = true)
                        }
                    }
                }
            }
        }
        LaunchedEffect(cardCreationViewModel) {
            cardCreationViewModel.setInitialDeck(mainViewModel.preferredDeckId)
        }
        CardCreationRouteContent(cardCreationViewModel, mainViewModel, navController, offlineEntryId, onExitSharedCapture)
    }
}

@Composable
private fun CardCreationRouteContent(
    cardCreationViewModel: CardCreationViewModel,
    mainViewModel: MainViewModel,
    navController: NavHostController,
    offlineEntryId: String?,
    onExitSharedCapture: () -> Unit,
) {
    val cardCreationState by cardCreationViewModel.state.collectAsState()
    val offline by mainViewModel.isOffline.collectAsState()
    LaunchedEffect(offline, cardCreationState.flowState) {
        val flow = cardCreationState.flowState as? CardCreationFlowState.DefinitionsLoaded
        if (offline &&
            (flow?.notice == CardCreationError.CREATE_CARD_FAILED || cardCreationState.flowState is CardCreationFlowState.LookupError)
        ) {
            mainViewModel.addEntry(cardCreationState.targetWord, cardCreationState.context)
        }
    }
    val navigateBack = {
        if (offlineEntryId != null) {
            navController.popBackStack(MainNavRoutes.OFFLINE_QUEUE, inclusive = false)
        } else if (mainViewModel.state.value is com.example.langueedroid.feature.capture.presentation.AppState.Screen.SharedWordCapture) {
            endCapture(mainViewModel, onExitSharedCapture) { navController.popBackStack(MainNavRoutes.CAPTURE, inclusive = true) }
        } else {
            mainViewModel.returnToCapture()
            navController.popBackStack()
        }
        Unit
    }
    val saving = cardCreationState.flowState is CardCreationFlowState.CreatingCard
    BackHandler { if (!saving) navigateBack() }
    CardCreationScreen(
        state = cardCreationState,
        speaker = cardCreationViewModel.speaker,
        onDeckSelected = { deck -> cardCreationViewModel.onDeckSelected(deck) },
        onDefinitionSelected = { def -> cardCreationViewModel.onDefinitionSelected(def) },
        onExampleConfirmed = { example -> cardCreationViewModel.onExampleConfirmed(example) },
        onBackFromExampleSelection = { cardCreationViewModel.onBackFromExampleSelection() },
        onCreateCard = {
            val context = cardCreationState.context
            if (cardCreationState.contextValid) {
                if (mainViewModel.isOffline.value) {
                    mainViewModel.addEntry(cardCreationState.targetWord, context)
                } else {
                    cardCreationViewModel.createCard()
                }
            }
        },
        onContextChanged = { cardCreationViewModel.onContextChanged(it) },
        onRetryDecks = { cardCreationViewModel.loadDecks() },
        onRetryLookup = { cardCreationViewModel.retryLookup() },
        onNavigateBack = { if (!saving) navigateBack() },
        onManualDefinitionTextChanged = { text -> cardCreationViewModel.onManualDefinitionTextChanged(text) },
        onManualExampleTextChanged = { text -> cardCreationViewModel.onManualExampleTextChanged(text) },
        onSubmitManualDefinition = { cardCreationViewModel.submitManualDefinition() },
    )
}

private fun NavGraphBuilder.ankiSetupRoute(navController: NavHostController) {
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
        val setupPermLauncher =
            rememberLauncherForActivityResult(
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
}

private fun NavGraphBuilder.ankiSyncRoute(navController: NavHostController) {
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
}

private fun NavGraphBuilder.reviewRoute(
    navController: NavHostController,
    onUnauthorized: () -> Unit,
) {
    composable(
        route = MainNavRoutes.REVIEW,
        arguments =
            listOf(
                navArgument("deckId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
    ) { backStackEntry ->
        val deckId =
            backStackEntry.arguments?.getString("deckId")?.let {
                URLDecoder.decode(it, "UTF-8")
            }
        val reviewViewModel: ReviewViewModel =
            hiltViewModel<ReviewViewModel, ReviewViewModel.Factory>(
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
            onFormInputChange = { key, text -> reviewViewModel.updateFormInput(key, text) },
            onSubmit = { reviewViewModel.submitAnswer() },
            onReveal = { reviewViewModel.reveal() },
            onGrade = { rating -> reviewViewModel.grade(rating) },
            onContinue = { reviewViewModel.next() },
            onRetry = { reviewViewModel.retry() },
            onDone = { navController.popBackStack(MainNavRoutes.DECKS, inclusive = false) },
            onNavigateBack = { navController.popBackStack(MainNavRoutes.DECKS, inclusive = false) },
        )
    }
}

private fun NavGraphBuilder.offlineQueueRoute(navController: NavHostController) {
    composable(MainNavRoutes.OFFLINE_QUEUE) {
        val offlineQueueViewModel: OfflineQueueViewModel = hiltViewModel()
        LaunchedEffect(offlineQueueViewModel) {
            offlineQueueViewModel.navigateToCardCreation.collect { request ->
                val route =
                    MainNavRoutes.cardCreation(
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
        dismissButton =
            if (showSetupAction) {
                { TextButton(onClick = onDismiss) { Text(stringResource(R.string.ankidroid_status_not_now)) } }
            } else {
                null
            },
    )
}
