package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportResult
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidExportRepository
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.core.domain.AnkiDroidExport
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.ExportPreference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class SyncViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var exportRepository: AnkiDroidExportRepository
    private lateinit var exportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore
    private lateinit var cardRepository: CardRepository
    private lateinit var deckRepository: DeckRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        exportRepository = mock()
        exportService = mock()
        prefsStore = mock()
        cardRepository = mock()
        deckRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun buildViewModel() = SyncViewModel(
        exportRepository = exportRepository,
        exportService = exportService,
        prefsStore = prefsStore,
        cardRepository = cardRepository,
        deckRepository = deckRepository,
    )

    private fun readySetup() = AnkiDroidSetupCheckResult(isReady = true, issues = emptyList())
    private fun notReadySetup() = AnkiDroidSetupCheckResult(isReady = false, issues = emptyList())

    private fun autoPrefs() = AnkiDroidSetupPrefs(
        noteTypeName = "Languee Mobile Native Type Vocabulary",
        exportPreference = ExportPreference.AUTO,
        setupCompleted = true,
    )

    private fun aCard(id: String, deckId: String = "deck-1", lemma: String = "maison") = Card(
        id = id,
        deckId = deckId,
        lemma = lemma,
        partOfSpeech = "noun",
        definition = "a house",
        example = "C'est ma maison.",
    )

    private fun aDeck(id: String = "deck-1", name: String = "Languee::French") = Deck(id = id, name = name)

    private fun aExportRecord(id: String = "exp-1", cardId: String = "c1") = AnkiDroidExport(
        id = id,
        cardId = cardId,
        status = AnkiExportStatus.Pending,
        ankiNoteId = null,
        ankiDeckId = null,
        ankiModelId = null,
        templateVersion = null,
    )

    // -------------------------------------------------------------------------
    // sync — initial state
    // -------------------------------------------------------------------------

    @Test
    fun `initial state is Idle`() {
        val vm = buildViewModel()
        assertEquals(SyncUiState.Idle, vm.uiState.value)
    }

    // -------------------------------------------------------------------------
    // sync — no pending cards → Result with zero counts
    // -------------------------------------------------------------------------

    @Test
    fun `sync with no pending cards reports zero synced and zero failed`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertTrue(state.failedWords.isEmpty())
    }

    // -------------------------------------------------------------------------
    // sync — getCardsWithPendingExport fails → empty result, no crash
    // -------------------------------------------------------------------------

    @Test
    fun `sync when fetching pending cards fails reports empty result`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.failure(RuntimeException("no network")))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertTrue(state.failedWords.isEmpty())
    }

    // -------------------------------------------------------------------------
    // sync — setup not ready → all pending cards reported as failed by id
    // -------------------------------------------------------------------------

    @Test
    fun `sync when setup not ready reports all pending cards as failed`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1", "c2")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(notReadySetup())

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertEquals(listOf("c1", "c2"), state.failedWords)
    }

    // -------------------------------------------------------------------------
    // sync — happy path: card fetched, exported, recorded as completed
    // -------------------------------------------------------------------------

    @Test
    fun `sync success exports note using real card data and deck name`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(listOf("c1")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(aDeck(id = "deck-1", name = "Languee::French"))))
        whenever(cardRepository.getCard("c1")).thenReturn(Result.success(aCard(id = "c1", deckId = "deck-1")))
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(AnkiDroidExportResult(noteId = 777L, deckId = 5L, modelId = 9L)))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(1, state.syncedCount)
        assertTrue(state.failedWords.isEmpty())

        verify(exportService).exportNote(
            noteTypeName = eq("Languee Mobile Native Type Vocabulary"),
            deckName = eq("Languee::French"),
            fields = any(),
            cardId = eq("c1"),
        )
        verify(exportRepository).recordAttemptCompleted(
            exportId = eq("exp-1"),
            ankiNoteId = eq(777L),
            ankiDeckId = eq(5L),
            ankiDeckNameSnapshot = eq("Languee::French"),
            ankiModelId = eq(9L),
            ankiModelNameSnapshot = eq("Languee Mobile Native Type Vocabulary"),
            templateVersion = any(),
        )
    }

    // -------------------------------------------------------------------------
    // sync — card fetch fails → reported as failed by id, no export attempted
    // -------------------------------------------------------------------------

    @Test
    fun `sync when card fetch fails reports card id as failed`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(listOf("c1")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(aDeck())))
        whenever(cardRepository.getCard("c1")).thenReturn(Result.failure(RuntimeException("not found")))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertEquals(listOf("c1"), state.failedWords)
        verify(exportService, never()).exportNote(any(), any(), any(), any())
    }

    // -------------------------------------------------------------------------
    // sync — deck name missing for card's deckId → reported as failed by lemma
    // -------------------------------------------------------------------------

    @Test
    fun `sync when deck name unresolved reports card lemma as failed`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(listOf("c1")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList()))
        whenever(cardRepository.getCard("c1"))
            .thenReturn(Result.success(aCard(id = "c1", deckId = "missing-deck", lemma = "maison")))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertEquals(listOf("maison"), state.failedWords)
        verify(exportService, never()).exportNote(any(), any(), any(), any())
    }

    // -------------------------------------------------------------------------
    // sync — export note fails → recorded as failed, lemma reported
    // -------------------------------------------------------------------------

    @Test
    fun `sync when export note fails records failed attempt and reports lemma`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(listOf("c1")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(aDeck(id = "deck-1"))))
        whenever(cardRepository.getCard("c1"))
            .thenReturn(Result.success(aCard(id = "c1", deckId = "deck-1", lemma = "maison")))
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.failure(RuntimeException("permission denied")))
        whenever(exportRepository.recordAttemptFailed(any(), any(), any()))
            .thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is SyncUiState.Result)
        state as SyncUiState.Result
        assertEquals(0, state.syncedCount)
        assertEquals(listOf("maison"), state.failedWords)

        verify(exportRepository).recordAttemptFailed(
            exportId = "exp-1",
            failureReason = "RuntimeException",
            failureMessage = "permission denied",
        )
    }

    // -------------------------------------------------------------------------
    // sync — concurrency guard: a sync already running is not restarted
    // -------------------------------------------------------------------------

    @Test
    fun `sync ignores second call while a sync is already running`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(listOf("c1")))
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(deckRepository.getDecks()).thenReturn(Result.success(listOf(aDeck(id = "deck-1"))))
        whenever(cardRepository.getCard("c1")).thenReturn(Result.success(aCard(id = "c1", deckId = "deck-1")))
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(AnkiDroidExportResult(noteId = 1L, deckId = 1L, modelId = 1L)))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        val vm = buildViewModel()
        vm.sync()
        vm.sync()
        advanceUntilIdle()

        verify(exportRepository, org.mockito.kotlin.times(1)).getCardsWithPendingExport()
    }

    // -------------------------------------------------------------------------
    // dismissResult — returns to Idle
    // -------------------------------------------------------------------------

    @Test
    fun `dismissResult resets state to Idle`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport()).thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        vm.sync()
        advanceUntilIdle()
        assertTrue(vm.uiState.value is SyncUiState.Result)

        vm.dismissResult()

        assertEquals(SyncUiState.Idle, vm.uiState.value)
    }
}
