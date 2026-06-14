package com.example.langueedroid.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.presentation.AnkiDroidExportViewModel
import com.example.langueedroid.presentation.AppState
import com.example.langueedroid.presentation.CardCreationViewModel
import com.example.langueedroid.presentation.DecksViewModel
import com.example.langueedroid.presentation.MainViewModel
import com.example.langueedroid.ui.ankidroid.AnkiDroidExportRetryScreen

@Composable
fun MainScreen(
    userEmail: String,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    deckRepository: DeckRepository,
    vocabularyRepository: VocabularyRepository,
    cardRepository: CardRepository,
    onUnauthorized: () -> Unit,
    sharedText: String?,
    ankiDroidPreferencesStore: AnkiDroidPreferencesStore? = null,
    ankiDroidExportService: AnkiDroidExportService? = null,
    ankiDroidExportRepository: AnkiDroidExportRepository? = null,
    ankiDroidApi: AnkiDroidApi? = null,
    modifier: Modifier = Modifier,
) {
    val mainViewModel: MainViewModel = viewModel(
        factory = MainViewModel.Factory(
            onEntryReadyForCardCreation = { _, _ ->
                // Navigation to CardCreation is driven by state change inside MainViewModel.addEntry.
            },
        ),
    )

    LaunchedEffect(sharedText) {
        if (!sharedText.isNullOrBlank()) {
            mainViewModel.startSharedTextCapture(sharedText)
        }
    }

    val state by mainViewModel.state.collectAsState()

    when (val currentState = state) {
        is AppState.Screen.Decks -> {
            val decksViewModel: DecksViewModel = viewModel(
                factory = DecksViewModel.Factory(
                    deckRepository = deckRepository,
                    onUnauthorized = onUnauthorized,
                    ankiDroidExportRepository = ankiDroidExportRepository,
                ),
            )
            val decksState by decksViewModel.decksState.collectAsState()
            val hasIncompleteExports by decksViewModel.hasIncompleteAnkiExports.collectAsState()
            DecksScreen(
                state = decksState,
                onDeckClick = { deck ->
                    // Deck click from decks screen navigates to capture (start manual add)
                    mainViewModel.startManualAdd()
                },
                onCreateDeck = { name, language ->
                    decksViewModel.createDeck(name, language, onCreated = {})
                },
                onLogout = onLogout,
                logoutInProgress = logoutInProgress,
                hasIncompleteExports = hasIncompleteExports,
                onAnkiDroidWarningClick = { mainViewModel.goToAnkiDroidExportRetry() },
                modifier = modifier,
            )
        }

        is AppState.Screen.AnkiDroidExportRetry -> {
            if (ankiDroidExportRepository != null && ankiDroidExportService != null && ankiDroidPreferencesStore != null) {
                val exportViewModel: AnkiDroidExportViewModel = viewModel(
                    factory = AnkiDroidExportViewModel.Factory(
                        exportRepository = ankiDroidExportRepository,
                        exportService = ankiDroidExportService,
                        prefsStore = ankiDroidPreferencesStore,
                    ),
                )
                val exportUiState by exportViewModel.uiState.collectAsState()
                AnkiDroidExportRetryScreen(
                    uiState = exportUiState,
                    onRetryExport = { cardId -> exportViewModel.retryExport(cardId) },
                    modifier = modifier,
                )
            } else {
                mainViewModel.exitAnkiDroidRetry()
            }
        }

        is AppState.Screen.CardCreation -> {
            val cardCreationViewModel: CardCreationViewModel = viewModel(
                key = "${currentState.targetWord}:${currentState.context}",
                factory = CardCreationViewModel.Factory(
                    targetWord = currentState.targetWord,
                    context = currentState.context,
                    deckRepository = deckRepository,
                    vocabularyRepository = vocabularyRepository,
                    cardRepository = cardRepository,
                    onUnauthorized = onUnauthorized,
                    onCardCreated = { mainViewModel.dismissCapture() },
                    ankiDroidExportRepository = ankiDroidExportRepository,
                    ankiDroidExportService = ankiDroidExportService,
                    prefsStore = ankiDroidPreferencesStore,
                ),
            )
            val cardCreationState by cardCreationViewModel.state.collectAsState()
            CardCreationScreen(
                state = cardCreationState,
                onDeckSelected = { deck -> cardCreationViewModel.onDeckSelected(deck) },
                onDefinitionSelected = { def -> cardCreationViewModel.onDefinitionSelected(def) },
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

        else -> mainViewModel.dismissCapture()
    }
}
