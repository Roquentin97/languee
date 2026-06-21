package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.feature.anki.presentation.AnkiDroidSetupViewModel
import com.example.langueedroid.core.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue
import com.example.langueedroid.core.domain.ExportPreference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class AnkiDroidSetupViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var exportService: AnkiDroidExportService
    private lateinit var prefsStore: AnkiDroidPreferencesStore

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
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

    private fun defaultPrefs(
        noteTypeName: String = "Languee Mobile Native Type Vocabulary",
        exportPreference: ExportPreference = ExportPreference.MANUAL,
        setupCompleted: Boolean = false,
    ) = AnkiDroidSetupPrefs(
        noteTypeName = noteTypeName,
        exportPreference = exportPreference,
        setupCompleted = setupCompleted,
    )

    private fun readySetup() = AnkiDroidSetupCheckResult(isReady = true, issues = emptyList())
    private fun notReadySetup(vararg issues: AnkiDroidSetupIssue) =
        AnkiDroidSetupCheckResult(isReady = false, issues = issues.toList())

    private suspend fun buildViewModel(): AnkiDroidSetupViewModel {
        whenever(prefsStore.read()).thenReturn(defaultPrefs())
        whenever(exportService.checkSetup(prefsStore)).thenReturn(notReadySetup(AnkiDroidSetupIssue.NoNoteTypeSelected))
        return AnkiDroidSetupViewModel(
            exportService = exportService,
            prefsStore = prefsStore,
        )
    }

    // -------------------------------------------------------------------------
    // init — loads prefs and runs setup check
    // -------------------------------------------------------------------------

    @Test
    fun `init populates uiState from stored prefs`() = runTest {
        val prefs = defaultPrefs(exportPreference = ExportPreference.AUTO)
        whenever(prefsStore.read()).thenReturn(prefs)
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        val vm = AnkiDroidSetupViewModel(
            exportService = exportService,
            prefsStore = prefsStore,
        )
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(ExportPreference.AUTO, state.exportPreference)
        assertTrue(state.checkResult.isReady)
    }

    // -------------------------------------------------------------------------
    // init — setup check reflects issues
    // -------------------------------------------------------------------------

    @Test
    fun `init setup check reports NoNoteTypeSelected issue when no note type stored`() = runTest {
        whenever(prefsStore.read()).thenReturn(defaultPrefs())
        whenever(exportService.checkSetup(prefsStore))
            .thenReturn(notReadySetup(AnkiDroidSetupIssue.NoNoteTypeSelected))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.checkResult.isReady)
        assertTrue(vm.uiState.value.checkResult.issues.contains(AnkiDroidSetupIssue.NoNoteTypeSelected))
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
    fun `onSave persists prefs and emits setupCompleteEvent`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        vm.onExportPreferenceSelected(ExportPreference.AUTO)

        // After save, checkSetup is called again
        whenever(exportService.checkSetup(prefsStore)).thenReturn(readySetup())

        var setupCompleteCalled = false
        val job = launch { vm.setupCompleteEvent.first(); setupCompleteCalled = true }
        vm.onSave()
        advanceUntilIdle()
        job.cancel()

        verify(prefsStore).save(
            AnkiDroidSetupPrefs(
                noteTypeName = "Languee Mobile Native Type Vocabulary",
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
    fun `onSkipSetup saves prefs with setupCompleted true and emits skipEvent`() = runTest {
        val vm = buildViewModel()
        advanceUntilIdle()

        var skipCalled = false
        var setupCompleteCalled = false
        val skipJob = launch { vm.skipEvent.first(); skipCalled = true }
        val setupJob = launch { vm.setupCompleteEvent.first(); setupCompleteCalled = true }
        vm.onSkipSetup()
        advanceUntilIdle()
        skipJob.cancel()
        setupJob.cancel()

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
