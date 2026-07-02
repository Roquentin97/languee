package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportResult
import com.example.langueedroid.feature.cardcreation.presentation.AnkiExportTriggerStatus
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationError
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationViewModel
import com.example.langueedroid.feature.cardcreation.presentation.DeckSelectionState
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.core.domain.AnkiDroidExport
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.ExportPreference
import com.example.langueedroid.core.domain.LookupResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
    private lateinit var speaker: Speaker

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        vocabularyRepository = mock()
        cardRepository = mock()
        exportRepository = mock()
        exportService = mock()
        prefsStore = mock()
        speaker = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aDeck(id: String = "d1") = Deck(id = id, name = "MyDeck")

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

    private fun autoExportPrefs() = AnkiDroidSetupPrefs(
        noteTypeName = "Languee Mobile Native Type Vocabulary",
        exportPreference = ExportPreference.AUTO,
        setupCompleted = true,
    )

    private fun manualExportPrefs() = AnkiDroidSetupPrefs(
        noteTypeName = "Languee Mobile Native Type Vocabulary",
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
        language = "en",
        deckRepository = deckRepository,
        vocabularyRepository = vocabularyRepository,
        cardRepository = cardRepository,
        ankiDroidExportRepository = exportRepository,
        ankiDroidExportService = exportService,
        prefsStore = prefsStore,
        speaker = speaker,
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
        vm.onExampleConfirmed("I have a cat")
        return Pair(vm, definition)
    }

    // -------------------------------------------------------------------------
    // Card creation without AnkiDroid dependencies — no export attempted
    // -------------------------------------------------------------------------

    @Test
    fun `createCard when setup is not ready still succeeds and emits cardCreatedEvent with NotTriggered`() = runTest {
        val deck = aDeck()
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(deck)))
        whenever(vocabularyRepository.lookup(any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.success(aLookupResult()))
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("card-1"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupNotReady())

        val vm = buildViewModel()
        var cardCreatedCalled = false
        val job = launch { vm.cardCreatedEvent.first(); cardCreatedCalled = true }
        advanceUntilIdle()
        vm.onDeckSelected(deck)
        advanceUntilIdle()

        val flowState = vm.state.value.flowState as CardCreationFlowState.DefinitionsLoaded
        vm.onDefinitionSelected(flowState.definitions[0])
        vm.onExampleConfirmed(null)
        vm.createCard()
        advanceUntilIdle()
        job.cancel()

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
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(cardId = "c-abc")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(AnkiDroidExportResult(noteId = 999L, deckId = 1L, modelId = 1L)))
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
    fun `cardCreatedEvent emitted after successful auto-export`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(autoExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(cardId = "c-abc")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(AnkiDroidExportResult(noteId = 999L, deckId = 1L, modelId = 1L)))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        var cardCreatedCalled = false
        val job = launch { vm.cardCreatedEvent.first(); cardCreatedCalled = true }
        vm.createCard()
        advanceUntilIdle()
        job.cancel()

        assertTrue(cardCreatedCalled)
    }

    // -------------------------------------------------------------------------
    // Auto-export — export service fails → CardCreated with Failed status,
    // backend attempt recorded as failed
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export note creation failure — CardCreated with Failed status and attempt recorded`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
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
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
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
    // Manual export preference — export record is still created, but the
    // actual AnkiDroid write is never attempted (deferred to the Sync screen)
    // -------------------------------------------------------------------------

    @Test
    fun `manual export preference — export record created but note never exported`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(setupReady())
        whenever(prefsStore.read()).thenReturn(manualExportPrefs())
        whenever(exportRepository.createOrGetExportRecord("c-abc"))
            .thenReturn(Result.success(aExportRecord(cardId = "c-abc")))

        vm.createCard()
        advanceUntilIdle()

        verify(exportRepository).createOrGetExportRecord("c-abc")
        verify(exportService, never()).exportNote(any(), any(), any(), any())
    }

    // -------------------------------------------------------------------------
    // Auto-export — createOrGetExportRecord fails → CardCreated with Failed status
    // -------------------------------------------------------------------------

    @Test
    fun `auto-export fails when export record creation fails — CardCreated with Failed`() = runTest {
        val (vm, _) = reachDefinitionsLoaded()
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull())).thenReturn(Result.success("c-abc"))
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
        whenever(cardRepository.createCard(any(), any(), anyOrNull(), anyOrNull()))
            .thenReturn(Result.failure(RuntimeException("server error")))

        vm.createCard()
        advanceUntilIdle()

        verify(exportService, never()).checkSetup(any())
        verify(exportRepository, never()).createOrGetExportRecord(any())
    }
}
