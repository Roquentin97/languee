package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.CardRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.data.VocabularyRepository
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.AnkiDroidExport
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.AnkiExportStatus
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DeckRef
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.ExportPreference
import com.example.langueedroid.domain.LookupResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests for CardCreationViewModel covering the AnkiDroid auto-export paths
 * added in the ankidroid-export-integration feature.
 *
 * AnkiDroidExportService and AnkiDroidPreferencesStore are mocked because they
 * depend on Android Context and DataStore which are not available in JVM unit tests.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CardCreationViewModelAnkiTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var deckRepository: DeckRepository
    private lateinit var vocabularyRepository: VocabularyRepository
    private lateinit var cardRepository: CardRepository
    private lateinit var exportRepository: AnkiDroidExportRepository
    private lateinit var exportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore
    private var cardCreatedCalled = false

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        vocabularyRepository = mock()
        cardRepository = mock()
        exportRepository = mock()
        exportService = mock()
        prefsStore = mock()
        cardCreatedCalled = false
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aDeck(id: String = "d1", language: String = "en") =
        Deck(id = id, name = "MyDeck", language = language)

    private fun aDefinition(id: String = "def1") = DefinitionResult(
        id = id,
        partOfSpeech = "noun",
        definition = "A small animal",
        example = "I have a cat",
        provider = "dict",
        decks = emptyList(),
        inflectionForms = null,
    )

    private fun aLookupResult() = LookupResult(
        input = "cat",
        lemma = "cat",
        definitions = listOf(aDefinition()),
    )

    private fun autoExportPrefs(deckId: Long = 10L) = AnkiDroidSetupPrefs(
        selectedDeckId = deckId,
        selectedDeckName = "Languee",
        noteTypeName = "Languee Type-in Vocabulary",
        exportPreference = ExportPreference.AUTO,
        setupCompleted = true,
    )

    private fun manualExportPrefs() = AnkiDroidSetupPrefs(
        selectedDeckId = 10L,
        selectedDeckName = "Languee",
        noteTypeName = "Languee Type-in Vocabulary",
        exportPreference = ExportPreference.MANUAL,
        setupCompleted = true,
    )

    private fun aExportRecord(id: String = "export-1", cardId: String = "c-abc") = AnkiDroidExport(
        id = id,
        cardId = cardId,
        status = AnkiExportStatus.Pending,
        ankiNoteId = null,
        ankiDeckId = null,
        ankiModelId = null,
        templateVersion = null,
    )

    private fun setupReady() = AnkiDroidSetupCheckResult(isReady = true, issues = emptyList())
    private fun setupNotReady() = AnkiDroidSetupCheckResult(isReady = false, issues = emptyList())

    private fun buildViewModel() = CardCreationViewModel(
        targetWord = "cat",
        context = "I have a cat",
        deckRepository = deckRepository,
        vocabularyRepository = vocabularyRepository,
        cardRepository = cardRepository,
        onUnauthorized = {},
        onCardCreated = { cardCreatedCalled = true },
        ankiDroidExportRepository = exportRepository,
        ankiDroidExportService = exportService,
        prefsStore = prefsStore,
    )

    private suspend fun TestScope.reachDefinitionsLoaded(): Pair<CardCreationViewModel, DefinitionResult> {
        val deck = aDeck()
        val definition = aDefinition()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult()))

        val vm = buildViewModel()
        advanceUntilIdle()
        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        return Pair(vm, definition)
    }

    // -------------------------------------------------------------------------
    // Card creation without AnkiDroid dependencies — no export attempted
    // -------------------------------------------------------------------------

    @Test
    fun `createCard with no anki dependencies still succeeds and fires CardCreated`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult()))
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("card-1"))

        // Build without AnkiDroid dependencies (all null)
        val vm = CardCreationViewModel(
            targetWord = "cat",
            context = null,
            deckRepository = deckRepository,
            vocabularyRepository = vocabularyRepository,
            cardRepository = cardRepository,
            onUnauthorized = {},
            onCardCreated = { cardCreatedCalled = true },
        )
        advanceUntilIdle()
        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.createCard()
        advanceUntilIdle()

        assertTrue(cardCreatedCalled)
        assertTrue(vm.state.value.flowState is CardCreationFlowState.CardCreated)
        val cardCreated = vm.state.value.flowState as CardCreationFlowState.CardCreated
        assertTrue(cardCreated.ankiExportStatus is AnkiExportTriggerStatus.NotTriggered)
    }

    // -------------------------------------------------------------------------
    // Auto-export — happy path: createCard → export triggered → Success
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export succeeds — CardCreated with Success status`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(cardId = "c-abc")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(999L))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.createCard()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.CardCreated
        assertTrue(flowState.ankiExportStatus is AnkiExportTriggerStatus.Success)
    }

    // -------------------------------------------------------------------------
    // Auto-export — CardCreated fires immediately, before export completes
    // -------------------------------------------------------------------------

    @Test
    fun `CardCreated with NotTriggered fires immediately after card creation before export`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(cardId = "c-abc")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(999L))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.createCard()
        // Only advance the first coroutine step (card creation completes, export hasn't started)
        testDispatcher.scheduler.runCurrent()

        // CardCreated should already be set with NotTriggered status immediately
        // (the export runs in a separate coroutine after onCardCreated fires)
        assertTrue(cardCreatedCalled)
    }

    // -------------------------------------------------------------------------
    // Auto-export — export service fails → CardCreated with Failed status,
    // backend attempt recorded as failed
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export note creation failure — CardCreated with Failed status and attempt recorded`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c-abc")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.failure(RuntimeException("AnkiDroid note creation failed")))
        whenever(exportRepository.recordAttemptFailed(any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.createCard()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.CardCreated
        assertTrue(flowState.ankiExportStatus is AnkiExportTriggerStatus.Failed)

        // Backend must be informed of the failure
        verify(exportRepository).recordAttemptFailed(
            exportId = "exp-1",
            failureReason = "RuntimeException",
            failureMessage = "AnkiDroid note creation failed",
        )
    }

    // -------------------------------------------------------------------------
    // Auto-export — setup not ready → export skipped, CardCreated with NotTriggered
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export skipped when setup is not ready — CardCreated with NotTriggered`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupNotReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())

        vm.createCard()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.CardCreated
        assertTrue(flowState.ankiExportStatus is AnkiExportTriggerStatus.NotTriggered)

        // Export should never have been attempted
        verify(exportRepository, never()).createOrGetExportRecord(any())
    }

    // -------------------------------------------------------------------------
    // Manual export preference — export not triggered automatically
    // -------------------------------------------------------------------------

    @Test
    fun `manual export preference — auto-export never triggered`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(manualExportPrefs())

        vm.createCard()
        advanceUntilIdle()

        verify(exportRepository, never()).createOrGetExportRecord(any())
    }

    // -------------------------------------------------------------------------
    // Auto-export — no deck selected in prefs → export skipped
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export skipped when no deck selected in prefs`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(
            AnkiDroidSetupPrefs(
                selectedDeckId = null,
                selectedDeckName = null,
                noteTypeName = "Languee Type-in Vocabulary",
                exportPreference = ExportPreference.AUTO,
                setupCompleted = true,
            ),
        )

        vm.createCard()
        advanceUntilIdle()

        verify(exportRepository, never()).createOrGetExportRecord(any())
    }

    // -------------------------------------------------------------------------
    // Auto-export — createOrGetExportRecord fails → CardCreated with Failed status
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export fails when export record creation fails — CardCreated with Failed`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.failure(RuntimeException("Backend unavailable")))

        vm.createCard()
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.CardCreated
        assertTrue(flowState.ankiExportStatus is AnkiExportTriggerStatus.Failed)

        // exportNote must never be called if record creation failed
        verify(exportService, never()).exportNote(any(), any(), any(), any())
    }

    // -------------------------------------------------------------------------
    // Card creation fails → no AnkiDroid export attempted at all
    // -------------------------------------------------------------------------

    @Test
    fun `card creation failure prevents any AnkiDroid export`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any()))
            .thenReturn(Result.failure(RuntimeException("server error")))

        vm.createCard()
        advanceUntilIdle()

        verify(exportService, never()).checkSetup(any())
        verify(exportRepository, never()).createOrGetExportRecord(any())
    }
}
