package com.example.langueedroid.presentation

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.ExportPreference
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AnkiDroidSetupUiState(
    val checkResult: AnkiDroidSetupCheckResult = AnkiDroidSetupCheckResult(false, emptyList()),
    val noteTypeName: String = NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
    val exportPreference: ExportPreference = ExportPreference.MANUAL,
    val isSaving: Boolean = false,
    val permissionPending: Boolean = false,
)

class AnkiDroidSetupViewModel(
    private val applicationContext: Context,
    private val exportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
    val onSetupComplete: () -> Unit,
    val onSkip: () -> Unit,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnkiDroidSetupUiState())
    val uiState: StateFlow<AnkiDroidSetupUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val prefs = prefsStore.read()
            _uiState.update {
                it.copy(
                    noteTypeName = prefs.noteTypeName,
                    exportPreference = prefs.exportPreference,
                    checkResult = exportService.checkSetup(prefsStore),
                )
            }
        }
    }

    fun runSetupCheck() {
        viewModelScope.launch {
            val result = exportService.checkSetup(prefsStore)
            _uiState.update { it.copy(checkResult = result) }
        }
    }

    fun onNoteTypeSelected(name: String) {
        _uiState.update { it.copy(noteTypeName = name) }
    }

    fun onExportPreferenceSelected(pref: ExportPreference) {
        _uiState.update { it.copy(exportPreference = pref) }
    }

    fun onSave() {
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            val current = _uiState.value
            prefsStore.save(
                AnkiDroidSetupPrefs(
                    noteTypeName = current.noteTypeName,
                    exportPreference = current.exportPreference,
                    setupCompleted = true,
                ),
            )
            runSetupCheck()
            _uiState.update { it.copy(isSaving = false) }
            onSetupComplete()
        }
    }

    fun onSkipSetup() {
        viewModelScope.launch {
            val current = _uiState.value
            prefsStore.save(
                AnkiDroidSetupPrefs(
                    noteTypeName = current.noteTypeName,
                    exportPreference = current.exportPreference,
                    setupCompleted = true,
                ),
            )
            onSkip()
        }
    }

    fun onPermissionGranted() {
        runSetupCheck()
    }

    class Factory(
        private val applicationContext: Context,
        private val exportService: AnkiDroidExportService,
        private val prefsStore: AnkiDroidPreferencesStore,
        private val onSetupComplete: () -> Unit,
        private val onSkip: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AnkiDroidSetupViewModel(
                applicationContext = applicationContext,
                exportService = exportService,
                prefsStore = prefsStore,
                onSetupComplete = onSetupComplete,
                onSkip = onSkip,
            ) as T
    }
}
