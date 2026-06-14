package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.AnkiDroidExport
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.AnkiExportStatus
import com.example.langueedroid.domain.ExportPreference
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
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
class AnkiDroidExportViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var exportRepository: AnkiDroidExportRepository
    private lateinit var exportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        exportRepository = mock()
        exportService = mock()
        prefsStore = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun buildViewModel() = AnkiDroidExportViewModel(
        exportRepository = exportRepository,
        exportService = exportService,
        prefsStore = prefsStore,
    )

    private fun readySetup() = AnkiDroidSetupCheckResult(isReady = true, issues = emptyList())
    private fun notReadySetup() = AnkiDroidSetupCheckResult(isReady = false, issues = emptyList())

    private fun autoPrefs(deckId: Long = 10L) = AnkiDroidSetupPrefs(
        selectedDeckId = deckId,
        selectedDeckName = "Languee",
        noteTypeName = "Languee Type-in Vocabulary",
        exportPreference = ExportPreference.AUTO,
        setupCompleted = true,
    )

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
    // init — load() called automatically, shows pending cards
    // -------------------------------------------------------------------------

    @Test
    fun `init loads pending export card ids and builds AnkiDroidExportItem list`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1", "c2", "c3")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertNull(state.error)
        assertEquals(3, state.items.size)
        assertTrue(state.items.all { it.status is AnkiExportStatus.Pending })
        assertEquals("c1", state.items[0].cardId)
        assertEquals("c2", state.items[1].cardId)
        assertEquals("c3", state.items[2].cardId)
    }

    // -------------------------------------------------------------------------
    // init — empty list → no items
    // -------------------------------------------------------------------------

    @Test
    fun `init with empty pending list shows empty items`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.items.isEmpty())
        assertFalse(vm.uiState.value.isLoading)
    }

    // -------------------------------------------------------------------------
    // init — 401 → error state
    // -------------------------------------------------------------------------

    @Test
    fun `init with 401 error sets error message in state`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.error)
        assertFalse(vm.uiState.value.isLoading)
    }

    // -------------------------------------------------------------------------
    // init — network failure → error state with message
    // -------------------------------------------------------------------------

    @Test
    fun `init network failure sets error message in state`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.failure(RuntimeException("no connection")))

        val vm = buildViewModel()
        advanceUntilIdle()

        val error = vm.uiState.value.error
        assertNotNull(error)
        assertTrue(error!!.isNotBlank())
    }

    // -------------------------------------------------------------------------
    // isLoading — initial state before coroutine completes
    // -------------------------------------------------------------------------

    @Test
    fun `isLoading is true before initial load completes`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(emptyList()))

        val vm = buildViewModel()
        // Do not advance
        assertTrue(vm.uiState.value.isLoading)
    }

    // -------------------------------------------------------------------------
    // load() — reloads items, clears error
    // -------------------------------------------------------------------------

    @Test
    fun `load() clears previous error and reloads items`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.failure(RuntimeException("initial failure")))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertNotNull(vm.uiState.value.error)

        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        vm.load()
        advanceUntilIdle()

        assertNull(vm.uiState.value.error)
        assertEquals(1, vm.uiState.value.items.size)
    }

    // -------------------------------------------------------------------------
    // retryExport — happy path: note exported → item removed from list
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport success removes card from items list`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1", "c2")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.success(777L))
        whenever(exportRepository.recordAttemptCompleted(any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.retryExport("c1")
        advanceUntilIdle()

        val items = vm.uiState.value.items
        assertEquals(1, items.size)
        assertEquals("c2", items[0].cardId)
    }

    // -------------------------------------------------------------------------
    // retryExport — export fails → item updated to Failed status
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport failure updates item status to Failed`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.failure(RuntimeException("permission denied")))
        whenever(exportRepository.recordAttemptFailed(any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.retryExport("c1")
        advanceUntilIdle()

        val item = vm.uiState.value.items.first()
        assertTrue(item.status is AnkiExportStatus.Failed)
    }

    // -------------------------------------------------------------------------
    // retryExport — export fails → backend attempt recorded as failed
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport failure records failed attempt to backend`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.success(aExportRecord(id = "exp-1", cardId = "c1")))
        whenever(exportService.exportNote(any(), any(), any(), any()))
            .thenReturn(Result.failure(RuntimeException("permission denied")))
        whenever(exportRepository.recordAttemptFailed(any(), any(), any()))
            .thenReturn(Result.success(Unit))

        vm.retryExport("c1")
        advanceUntilIdle()

        verify(exportRepository).recordAttemptFailed(
            exportId = "exp-1",
            failureReason = "RuntimeException",
            failureMessage = "permission denied",
        )
    }

    // -------------------------------------------------------------------------
    // retryExport — setup not ready → skipped silently
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport skipped when setup is not ready`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(notReadySetup())

        vm.retryExport("c1")
        advanceUntilIdle()

        verify(exportRepository, never()).createOrGetExportRecord(any())
    }

    // -------------------------------------------------------------------------
    // retryExport — no deck configured in prefs → skipped
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport skipped when no deck configured in prefs`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(
            AnkiDroidSetupPrefs(
                selectedDeckId = null,
                selectedDeckName = null,
                noteTypeName = "Languee Type-in Vocabulary",
                exportPreference = ExportPreference.AUTO,
                setupCompleted = true,
            ),
        )

        vm.retryExport("c1")
        advanceUntilIdle()

        verify(exportRepository, never()).createOrGetExportRecord(any())
    }

    // -------------------------------------------------------------------------
    // retryExport — createOrGetExportRecord fails → skipped silently
    // -------------------------------------------------------------------------

    @Test
    fun `retryExport skipped when export record creation fails`() = runTest {
        whenever(exportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        whenever(prefsStore.read()).thenReturn(autoPrefs())
        whenever(exportRepository.createOrGetExportRecord("c1"))
            .thenReturn(Result.failure(RuntimeException("backend error")))

        vm.retryExport("c1")
        advanceUntilIdle()

        verify(exportService, never()).exportNote(any(), any(), any(), any())
    }
}
