package com.example.langueedroid.presentation

import android.content.Context
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.AnkiDroidSetupIssue
import com.example.langueedroid.domain.ExportPreference
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
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class AnkiDroidSetupViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var context: Context
    private lateinit var exportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore
    private lateinit var ankiDroidApi: AnkiDroidApi
    private var setupCompleteCalled = false
    private var skipCalled = false

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        context = mock()
        exportService = mock()
        prefsStore = mock()
        ankiDroidApi = mock()
        setupCompleteCalled = false
        skipCalled = false
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun defaultPrefs(
        deckId: Long? = null,
        deckName: String? = null,
        noteTypeName: String = "Languee Type-in Vocabulary",
        exportPreference: ExportPreference = ExportPreference.MANUAL,
        setupCompleted: Boolean = false,
    ) = AnkiDroidSetupPrefs(
        selectedDeckId = deckId,
        selectedDeckName = deckName,
        noteTypeName = noteTypeName,
        exportPreference = exportPreference,
        setupCompleted = setupCompleted,
    )

    private fun readySetup() = AnkiDroidSetupCheckResult(isReady = true, issues = emptyList())
    private fun notReadySetup(vararg issues: AnkiDroidSetupIssue) =
        AnkiDroidSetupCheckResult(isReady = false, issues = issues.toList())

    private suspend fun buildViewModel(): AnkiDroidSetupViewModel {
        whenever(prefsStore.read()).thenReturn(defaultPrefs())
        whenever(exportService.checkSetup(prefsStore)).thenReturn(notReadySetup(AnkiDroidSetupIssue.NoDeckSelected))
        return AnkiDroidSetupViewModel(
            applicationContext = context,
            exportService = exportService,
            prefsStore = prefsStore,
            ankiDroidApi = ankiDroidApi,
            onSetupComplete = { setupCompleteCalled = true },
            onSkip = { skipCalled = true },
        )
    }

    // -------------------------------------------------------------------------
    // init — loads prefs and runs setup check
    // -------------------------------------------------------------------------

    @Test
    fun `init populates uiState from stored prefs`() = runTest {
        val prefs = defaultPrefs(
            deckId = 42L,
            deckName = "Languee",
            exportPreference = ExportPreference.AUTO,
        )
        whenever(prefsStore.read()).thenReturn(prefs)
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        val vm = AnkiDroidSetupViewModel(
            applicationContext = context,
            exportService = exportService,
            prefsStore = prefsStore,
            ankiDroidApi = ankiDroidApi,
            onSetupComplete = {},
            onSkip = {},
        )
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(42L, state.selectedDeckId)
        assertEquals("Languee", state.selectedDeckName)
        assertEquals(ExportPreference.AUTO, state.exportPreference)
        assertTrue(state.checkResult.isReady)
    }

    // -------------------------------------------------------------------------
    // init — setup check reflects issues
    // -------------------------------------------------------------------------

    @Test
    fun `init setup check reports NoDeckSelected issue when no deck stored`() = runTest {
        whenever(prefsStore.read()).thenReturn(defaultPrefs())
        whenever(exportService.checkSetup(prefsStore))
            .thenReturn(notReadySetup(AnkiDroidSetupIssue.NoDeckSelected))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.checkResult.isReady)
        assertTrue(vm.uiState.value.checkResult.issues.contains(AnkiDroidSetupIssue.NoDeckSelected))
    }

    // -------------------------------------------------------------------------
    // loadAvailableDecks — populates deck list
    // -------------------------------------------------------------------------

    @Test
    fun `loadAvailableDecks populates availableDecks when api returns deck list`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        val decks = mapOf(1L to "General", 2L to "Languee")
        whenever(ankiDroidApi.getDeckList()).thenReturn(decks)

        vm.loadAvailableDecks()
        advanceUntilIdle()

        val available = vm.uiState.value.availableDecks
        assertNotNull(available)
        assertEquals(2, available!!.size)
        assertTrue(available.any { it.first == 1L && it.second == "General" })
        assertTrue(available.any { it.first == 2L && it.second == "Languee" })
    }

    // -------------------------------------------------------------------------
    // loadAvailableDecks — empty deck list from AnkiDroid
    // -------------------------------------------------------------------------

    @Test
    fun `loadAvailableDecks with empty api result stores empty list`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(ankiDroidApi.getDeckList()).thenReturn(emptyMap())

        vm.loadAvailableDecks()
        advanceUntilIdle()

        val available = vm.uiState.value.availableDecks
        assertNotNull(available)
        assertTrue(available!!.isEmpty())
    }

    // -------------------------------------------------------------------------
    // loadAvailableDecks — AnkiDroid unavailable returns null
    // -------------------------------------------------------------------------

    @Test
    fun `loadAvailableDecks with null api result stores null availableDecks`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(ankiDroidApi.getDeckList()).thenReturn(null)

        vm.loadAvailableDecks()
        advanceUntilIdle()

        assertNull(vm.uiState.value.availableDecks)
    }

    // -------------------------------------------------------------------------
    // loadAvailableDecks — isLoadingDecks flag
    // -------------------------------------------------------------------------

    @Test
    fun `isLoadingDecks becomes false after loadAvailableDecks completes`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(ankiDroidApi.getDeckList()).thenReturn(emptyMap())

        vm.loadAvailableDecks()
        // Before advancing: isLoading should be true
        assertTrue(vm.uiState.value.isLoadingDecks)

        advanceUntilIdle()
        assertFalse(vm.uiState.value.isLoadingDecks)
    }

    // -------------------------------------------------------------------------
    // onDeckSelected — updates selectedDeckId and name in state
    // -------------------------------------------------------------------------

    @Test
    fun `onDeckSelected updates selectedDeckId and selectedDeckName`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(77L, "French")

        assertEquals(77L, vm.uiState.value.selectedDeckId)
        assertEquals("French", vm.uiState.value.selectedDeckName)
    }

    // -------------------------------------------------------------------------
    // onCreateDedicatedDeck — creates deck named Languee and stores its id
    // -------------------------------------------------------------------------

    @Test
    fun `onCreateDedicatedDeck creates Languee deck and stores returned id`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(ankiDroidApi.getOrCreateDeck("Languee")).thenReturn(88L)

        vm.onCreateDedicatedDeck()
        advanceUntilIdle()

        assertEquals(88L, vm.uiState.value.selectedDeckId)
        assertEquals("Languee", vm.uiState.value.selectedDeckName)
    }

    @Test
    fun `onCreateDedicatedDeck leaves deck unset when api returns null`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(ankiDroidApi.getOrCreateDeck("Languee")).thenReturn(null)

        vm.onCreateDedicatedDeck()
        advanceUntilIdle()

        assertNull(vm.uiState.value.selectedDeckId)
    }

    // -------------------------------------------------------------------------
    // onNoteTypeSelected — updates noteTypeName
    // -------------------------------------------------------------------------

    @Test
    fun `onNoteTypeSelected updates noteTypeName in state`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onNoteTypeSelected("Languee Basic + Reversed Vocabulary")

        assertEquals("Languee Basic + Reversed Vocabulary", vm.uiState.value.noteTypeName)
    }

    // -------------------------------------------------------------------------
    // onExportPreferenceSelected — updates exportPreference
    // -------------------------------------------------------------------------

    @Test
    fun `onExportPreferenceSelected AUTO updates preference to AUTO`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onExportPreferenceSelected(ExportPreference.AUTO)

        assertEquals(ExportPreference.AUTO, vm.uiState.value.exportPreference)
    }

    @Test
    fun `onExportPreferenceSelected MANUAL updates preference to MANUAL`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onExportPreferenceSelected(ExportPreference.MANUAL)

        assertEquals(ExportPreference.MANUAL, vm.uiState.value.exportPreference)
    }

    // -------------------------------------------------------------------------
    // onSave — persists prefs, re-runs setup check, fires onSetupComplete
    // -------------------------------------------------------------------------

    @Test
    fun `onSave persists prefs and calls onSetupComplete`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onDeckSelected(10L, "Languee")
        vm.onExportPreferenceSelected(ExportPreference.AUTO)

        // After save, checkSetup is called again
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        vm.onSave()
        advanceUntilIdle()

        verify(prefsStore).save(
            AnkiDroidSetupPrefs(
                selectedDeckId = 10L,
                selectedDeckName = "Languee",
                noteTypeName = "Languee Type-in Vocabulary",
                exportPreference = ExportPreference.AUTO,
                setupCompleted = true,
            ),
        )
        assertTrue(setupCompleteCalled)
    }

    @Test
    fun `onSave sets isSaving to false after completion`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        vm.onSave()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isSaving)
    }

    // -------------------------------------------------------------------------
    // onSkipSetup — persists prefs with setupCompleted=true and fires onSkip
    // -------------------------------------------------------------------------

    @Test
    fun `onSkipSetup saves prefs with setupCompleted true and calls onSkip`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onSkipSetup()
        advanceUntilIdle()

        verify(prefsStore).save(any())
        assertTrue(skipCalled)
        assertFalse(setupCompleteCalled)
    }

    // -------------------------------------------------------------------------
    // onPermissionGranted — re-runs setup check
    // -------------------------------------------------------------------------

    @Test
    fun `onPermissionGranted triggers setup re-check`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        vm.onPermissionGranted()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.checkResult.isReady)
    }

    // -------------------------------------------------------------------------
    // runSetupCheck — updates checkResult
    // -------------------------------------------------------------------------

    @Test
    fun `runSetupCheck updates checkResult in uiState`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        // Initially not ready (from buildViewModel stub)
        assertFalse(vm.uiState.value.checkResult.isReady)

        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())
        vm.runSetupCheck()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.checkResult.isReady)
    }
}
